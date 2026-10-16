import type { User } from "../generated/prisma/client";
import { prisma } from "./prisma";
import { generateUniqueReferralCode } from "./referral";
import { identifierHash } from "./identifierHash";
import { loginOtpIdentifier } from "./identity";
import { discardOtp } from "./otpStore";
import { releaseListingSeats } from "./listingSeats";
import { storageProvider } from "./storage";
import { phoneOtpAvailable } from "./sms";
import { smsAllowedCountryCodes } from "./config";
import { isPhoneCountryAllowed, type IdentifierChannel } from "./validators";

// Account deletion - DELETE /api/users/me (the user) and POST
// /api/admin/users/:id/delete (an ADMIN, for requests made by email and for
// suspended users, who can't sign in). Nothing is hard-deleted from User:
// reports, ratings and transactions keep pointing at the row, which becomes
// an anonymous record with every personal field cleared and deletedAt set
// (attachUser never signs one in). What happens to everything else:
//
// - open reservations, either side: EXPIRED, seats given back;
// - the user's live listings (ACTIVE / PARTIALLY_SOLD): WITHDRAWN;
//   past ones stay, with their one-way ticket fingerprint;
// - alerts (+ their notifications), push devices and push history,
//   listing views and contacts, venue pin votes and points: deleted;
// - ratings they gave: stars kept (sellers' averages stay honest), comment
//   text deleted; ratings they received: kept, but the public summary of a
//   deleted account is empty (routes/users.ts);
// - fraud reports filed by or against them: kept, for fraud prevention;
// - suspendedAt/suspensionReason: kept. For an account suspended at
//   deletion time only, keyed hashes of its *verified* email and phone are
//   stored (DeletedIdentifier) so it can't sign straight back up - see
//   lib/suspendedIdentifiers.ts. Unverified identifiers were never
//   proven to be theirs, so they're never hashed, and no other account
//   keeps anything from its email or phone.
// - the profile photo: deleted from storage once the database is done
//   (best-effort - a storage failure is logged, never undoes the deletion).
//
// Reports, suspension records and hashes are purged 3 years after deletion
// (jobs/purgeDeletedAccountRecords.ts).

export class AccountNotFoundError extends Error {}
export class AccountAlreadyDeletedError extends Error {}

// The confirmation code's OTP store identifier: bound to the account, not
// to an address, so no other flow's code (login, add-identifier) can ever
// be redeemed for it.
export function deleteOtpIdentifier(userId: string): string {
  return `account-delete:${userId}`;
}

// Where the confirmation code goes: the verified email, else the verified
// phone if SMS can actually reach it - or nowhere, in which case typing
// DELETE is the whole confirmation (a phone-only account while SMS is off).
// Decided here, never by the client.
export function deleteCodeChannel(
  user: Pick<User, "email" | "emailVerifiedAt" | "phone" | "phoneVerifiedAt">,
): { channel: IdentifierChannel; value: string } | null {
  if (user.email && user.emailVerifiedAt) return { channel: "email", value: user.email };
  if (
    user.phone &&
    user.phoneVerifiedAt &&
    phoneOtpAvailable() &&
    isPhoneCountryAllowed(user.phone, smsAllowedCountryCodes())
  ) {
    return { channel: "phone", value: user.phone };
  }
  return null;
}

interface ExpiredHold {
  status: string;
  listingId: string;
  seatsCount: number;
}

export async function deleteUserAccount(userId: string): Promise<void> {
  // Outside the transaction: it queries prisma directly. A fresh code means
  // the account's old ?ref= links stop crediting anyone.
  const referralCode = await generateUniqueReferralCode();

  const deleted = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new AccountNotFoundError();
    if (user.deletedAt) throw new AccountAlreadyDeletedError();

    if (user.suspendedAt) {
      const hashes = [
        user.email && user.emailVerifiedAt ? identifierHash("email", user.email) : null,
        user.phone && user.phoneVerifiedAt ? identifierHash("phone", user.phone) : null,
      ].filter((h): h is string => h !== null);
      if (hashes.length > 0) {
        await tx.deletedIdentifier.createMany({
          data: hashes.map((hash) => ({ hash, userId })),
          skipDuplicates: true,
        });
      }
    }

    // Open holds - as the buyer, or on this user's listings - end now and
    // give their seats back (only RESERVED actually holds seats). Same
    // atomic, re-checked UPDATE as jobs/expireReservations.ts.
    const expired = await tx.$queryRaw<ExpiredHold[]>`
      UPDATE "Transaction" t
      SET status = 'EXPIRED'
      FROM "Transaction" old
      WHERE t.id = old.id
        AND t.status IN ('PENDING', 'RESERVED')
        AND (t."buyerId" = ${userId}
             OR t."listingId" IN (SELECT id FROM "Listing" WHERE "sellerId" = ${userId}))
      RETURNING old.status::text AS status, t."listingId", t."seatsCount"
    `;
    for (const hold of expired) {
      if (hold.status === "RESERVED") await releaseListingSeats(tx, hold.listingId, hold.seatsCount);
    }

    await tx.listing.updateMany({
      where: { sellerId: userId, status: { in: ["ACTIVE", "PARTIALLY_SOLD"] } },
      data: { status: "WITHDRAWN" },
    });

    await tx.alertNotification.deleteMany({ where: { alert: { userId } } });
    await tx.ticketAlert.deleteMany({ where: { userId } });
    // This account's devices stop receiving notifications; its push history
    // (no tokens or text in it) goes too.
    await tx.pushDelivery.deleteMany({ where: { userId } });
    await tx.pushToken.deleteMany({ where: { userId } });
    await tx.listingView.deleteMany({ where: { userId } });
    await tx.listingContact.deleteMany({ where: { userId } });
    await tx.venuePinVote.deleteMany({ where: { userId } });
    await tx.pointsLedger.deleteMany({ where: { userId } });
    await tx.rating.updateMany({ where: { raterId: userId }, data: { comment: null } });

    await tx.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        email: null,
        emailVerifiedAt: null,
        phone: null,
        phoneVerifiedAt: null,
        hasWhatsapp: false,
        name: null,
        fullName: null,
        dateOfBirth: null,
        gender: null,
        address: null,
        profileImageUrl: null,
        razorpayAccountId: null,
        lastLoginAt: null,
        referralCode,
        referredByUserId: null,
        isReviewAccount: false,
        isAdmin: false,
      },
    });

    return user;
  });

  await discardOtp(deleteOtpIdentifier(userId));
  if (deleted.email) await discardOtp(loginOtpIdentifier("email", deleted.email));
  if (deleted.phone) await discardOtp(loginOtpIdentifier("phone", deleted.phone));

  if (deleted.profileImageUrl) {
    try {
      await storageProvider.delete(deleted.profileImageUrl);
    } catch (err) {
      // The url itself isn't logged - it's the deleted user's photo.
      console.error(`[account-deletion] couldn't delete profile photo for ${userId}`, err);
    }
  }
}

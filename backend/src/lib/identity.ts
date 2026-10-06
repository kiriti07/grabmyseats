import type { Prisma, User } from "../generated/prisma/client";
import { prisma } from "./prisma";
import type { IdentifierChannel } from "./validators";

// An identifier - email or phone - is a login identity only once it's
// verified (emailVerifiedAt / phoneVerifiedAt set). Unverified ones are just
// self-reported profile data: they never log anyone in, and they lose to
// anyone who later proves they own the identifier (claimVerifiedIdentifier
// below). One identifier verified on one account can never be claimed by
// another.
//
// Email matching is case-insensitive: new emails are stored lowercased
// (validators.ts's normalizeLoginEmail), but rows written before that may
// have mixed case, and the DB's own unique index on email is
// case-sensitive. Phones are stored normalized E.164 and match exactly.

type Tx = Prisma.TransactionClient;

export class IdentifierOwnedByAnotherAccountError extends Error {}

function matches(channel: IdentifierChannel, value: string): Prisma.UserWhereInput {
  return channel === "email"
    ? { email: { equals: value, mode: "insensitive" } }
    : { phone: value };
}

function verifiedField(channel: IdentifierChannel): "emailVerifiedAt" | "phoneVerifiedAt" {
  return channel === "email" ? "emailVerifiedAt" : "phoneVerifiedAt";
}

// The user (if any) that this identifier logs in as. Oldest first, purely so
// a pre-existing email case-variant duplicate (impossible to create from
// here on - see claimVerifiedIdentifier) always resolves to the same
// account.
export function findUserByVerifiedIdentifier(
  channel: IdentifierChannel,
  value: string,
  tx: Tx = prisma,
): Promise<User | null> {
  return tx.user.findFirst({
    where: { ...matches(channel, value), [verifiedField(channel)]: { not: null } },
    orderBy: { createdAt: "asc" },
  });
}

// Drops every *unverified* claim on this identifier held by any account
// other than `exceptUserId` - called whenever someone has just proven they
// own it (login OTP, add-identifier OTP, email verification link). Only the
// identifier itself is cleared (plus hasWhatsapp, which only describes a
// phone); the verified-at column is already null on every row this matches.
export async function clearUnverifiedClaims(
  tx: Tx,
  channel: IdentifierChannel,
  value: string,
  exceptUserId: string | null,
): Promise<void> {
  await tx.user.updateMany({
    where: {
      ...matches(channel, value),
      [verifiedField(channel)]: null,
      ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
    },
    data: channel === "email" ? { email: null } : { phone: null, hasWhatsapp: false },
  });
}

// Makes this identifier the verified login identity of `userId`, for a
// caller who has just proven they own it. The proven owner wins over any
// other account's unverified claim (cleared), but never over another
// account that has itself already verified it - that throws, since two
// accounts can't share a login identity.
export function claimVerifiedIdentifier(
  userId: string,
  channel: IdentifierChannel,
  value: string,
): Promise<User> {
  return prisma.$transaction(async (tx) => {
    const owner = await findUserByVerifiedIdentifier(channel, value, tx);
    if (owner && owner.id !== userId) throw new IdentifierOwnedByAnotherAccountError();

    await clearUnverifiedClaims(tx, channel, value, userId);
    return tx.user.update({
      where: { id: userId },
      data:
        channel === "email"
          ? { email: value, emailVerifiedAt: new Date() }
          : { phone: value, phoneVerifiedAt: new Date() },
    });
  });
}

// OTP store identifiers (see lib/otpStore.ts) for the two code flows.
// Namespaced by flow and channel, so a login code can never be redeemed as
// (or overwrite) an add-identifier code, and the add-identifier one is
// bound to the requesting user as well as the identifier, so it can only
// ever attach it to the account that asked for it.
export function loginOtpIdentifier(channel: IdentifierChannel, value: string): string {
  return `login:${channel}:${value}`;
}

export function claimOtpIdentifier(
  userId: string,
  channel: IdentifierChannel,
  value: string,
): string {
  return `claim:${userId}:${channel}:${value}`;
}

export function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === "object" && "code" in err && err.code === "P2002";
}

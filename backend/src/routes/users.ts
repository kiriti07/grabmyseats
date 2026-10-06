import { randomUUID } from "node:crypto";
import { Router } from "express";
import type {
  ApiResponse,
  RatingSummary,
  ReferralSummary,
  SellerDeliveryEligibility,
  User as SharedUser,
} from "@grabmyseats/shared";
import { prisma } from "../lib/prisma";
import { storageProvider } from "../lib/storage";
import { requireAuth } from "../middleware/auth";
import { uploadProfileImage } from "../middleware/upload";
import { getSellerDeliveryEligibility } from "../lib/sellerTrust";
import { getRatingSummary } from "../lib/ratingSummary";
import { getReferralSummary } from "../lib/referral";
import { toSharedUser } from "../lib/serialize";
import { normalizeLoginEmail, PHONE_RE } from "../lib/validators";
import { APP_URL } from "../lib/config";
import { emailProvider, sendOtpEmail } from "../lib/email";
import {
  consumeEmailVerificationToken,
  issueEmailVerificationToken,
} from "../lib/emailVerificationStore";
import { issueOtp, verifyOtp } from "../lib/otpStore";
import {
  claimOtpIdentifier,
  claimVerifiedEmail,
  EmailOwnedByAnotherAccountError,
  isUniqueViolation,
} from "../lib/emailIdentity";
import {
  otpEmailLimiter,
  otpEmailDailyLimiter,
  otpIpLimiter,
  otpGlobalLimiter,
} from "../middleware/rateLimit";
import { LIVE_LISTING_STATUSES } from "@grabmyseats/shared";

export const usersRouter = Router();

// Whether this user currently qualifies to offer EMAIL_FORWARD delivery as
// a seller - the sell form calls this to explain the trust gate (rather
// than just hiding the option) before the seller picks delivery methods.
// See lib/sellerTrust.ts, which POST /api/listings also enforces
// server-side.
usersRouter.get("/me/delivery-eligibility", requireAuth, async (req, res) => {
  const eligibility = await getSellerDeliveryEligibility(req.user!.id);
  const body: ApiResponse<SellerDeliveryEligibility> = { success: true, data: eligibility };
  res.json(body);
});

// This user's own referral code, qualified-referral count, points
// balance, and progress toward the next 20-referral milestone - see
// lib/referral.ts. Qualified-referral count and points balance are both
// derived fresh on every call (a distinct-user query and a PointsLedger
// SUM respectively), never read off a maintained counter.
usersRouter.get("/me/referrals", requireAuth, async (req, res) => {
  const summary = await getReferralSummary(req.user!.id);
  const body: ApiResponse<ReferralSummary> = { success: true, data: summary };
  res.json(body);
});

usersRouter.get("/me/profile", requireAuth, async (req, res) => {
  const body: ApiResponse<{ user: SharedUser }> = {
    success: true,
    data: { user: toSharedUser(req.user!) },
  };
  res.json(body);
});

// Public, unauthenticated - the aggregate consumed by the listing detail
// page and the contact-reveal screen (which embed it themselves without
// exposing a user id - see sellerRatingSummary/TransactionContact.ratingSummary),
// and also directly callable with an id, e.g. from a future seller
// profile page. No existence check on :id: a bogus/nonexistent id and a
// real seller with zero ratings both just come back as "no ratings" -
// deliberately indistinguishable, rather than a 404 that would let this
// endpoint be used to probe which user ids exist.
usersRouter.get("/:id/rating-summary", async (req, res) => {
  const userId = req.params.id as string;
  const summary = await getRatingSummary(userId);
  const body: ApiResponse<RatingSummary> = { success: true, data: summary };
  res.json(body);
});

function requireNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

// Edits the profile fields below. Every text field here is a full replace,
// not a partial merge - the edit form always submits the whole profile, so
// an omitted/blank optional field means "clear it". Two exceptions:
// profileImageUrl only changes when a profileImage file is actually
// attached to this request (same "send only what's changing" shape as
// PATCH /api/listings/:id), and phone only changes when the field is sent
// at all (omitted = unchanged, blank = clear), so a client built before
// phone was editable here can't wipe it.
//
// A *verified* email is the login identity (lib/emailIdentity.ts) and
// can't be changed here - that would leave the account with no way to log
// in until the new address is verified. It goes through POST
// /me/email/claim/request -> /claim/verify instead, which only switches
// once the new address is proven. An unverified (or absent) email is still
// a plain profile field here, verifiable later via POST
// /me/email/send-verification.
usersRouter.patch("/me/profile", requireAuth, uploadProfileImage, async (req, res) => {
  const fullName = requireNonEmptyString(req.body?.fullName);
  const emailRaw = requireNonEmptyString(req.body?.email);
  const email = emailRaw ? normalizeLoginEmail(emailRaw) : null;
  // undefined = not sent (leave unchanged); null = sent blank (clear).
  const phone =
    req.body?.phone === undefined ? undefined : requireNonEmptyString(req.body.phone);
  const dateOfBirthRaw = requireNonEmptyString(req.body?.dateOfBirth);
  const gender = requireNonEmptyString(req.body?.gender);
  const address = requireNonEmptyString(req.body?.address);
  // A checkbox, not free text - multipart fields are always strings, so
  // this is "true" or absent/anything else, not a real boolean on the
  // wire. Always sent by the edit form (no "omitted means unchanged" case
  // the text fields above have).
  const hasWhatsapp = req.body?.hasWhatsapp === "true";

  const errors: string[] = [];
  if (!fullName) errors.push("fullName is required");
  if (emailRaw && !email) errors.push("email must be a valid email address");
  if (phone && !PHONE_RE.test(phone)) {
    errors.push("phone must include the country code, e.g. +919876543210");
  }

  let dateOfBirth: Date | null = null;
  if (dateOfBirthRaw) {
    const parsed = new Date(dateOfBirthRaw);
    if (Number.isNaN(parsed.getTime())) {
      errors.push("dateOfBirth must be a valid date");
    } else if (parsed.getTime() > Date.now()) {
      errors.push("dateOfBirth cannot be in the future");
    } else {
      dateOfBirth = parsed;
    }
  }

  if (errors.length > 0) {
    const body: ApiResponse<never> = { success: false, error: errors.join("; ") };
    res.status(400).json(body);
    return;
  }

  const currentEmail = req.user!.email;
  const hasVerifiedEmail = currentEmail !== null && req.user!.emailVerifiedAt !== null;
  // Omitted/blank leaves a verified email as-is (it can't be cleared -
  // it's how this account logs in); only a *different* address is refused.
  if (hasVerifiedEmail && email !== null && email !== currentEmail.toLowerCase()) {
    const body: ApiResponse<never> = {
      success: false,
      error: "Your sign-in email can only be changed by confirming the new address",
    };
    res.status(409).json(body);
    return;
  }

  if (phone !== undefined && phone !== req.user!.phone) {
    if (phone === null) {
      // Phone is required to sell (POST /api/listings) - and it's what a
      // buyer is handed at contact reveal - so it can't be removed out
      // from under a live listing.
      const liveListings = await prisma.listing.count({
        where: { sellerId: req.user!.id, status: { in: LIVE_LISTING_STATUSES } },
      });
      if (liveListings > 0) {
        const body: ApiResponse<never> = {
          success: false,
          error: "You need a phone number while you have live listings",
        };
        res.status(400).json(body);
        return;
      }
    } else {
      const holder = await prisma.user.findFirst({
        where: { phone, id: { not: req.user!.id } },
        select: { id: true },
      });
      if (holder) {
        const body: ApiResponse<never> = {
          success: false,
          error: "That phone number is already in use by another account",
        };
        res.status(409).json(body);
        return;
      }
    }
  }

  let profileImageUrl: string | undefined;
  if (req.file) {
    const filename = `${req.user!.id}-${randomUUID()}`;
    const uploaded = await storageProvider.upload(req.file.buffer, filename, {
      folder: "profiles",
    });
    profileImageUrl = uploaded.url;
  }

  try {
    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        fullName,
        dateOfBirth,
        gender,
        address,
        hasWhatsapp,
        ...(phone !== undefined ? { phone } : {}),
        ...(profileImageUrl ? { profileImageUrl } : {}),
        // A verified email was already checked above to be unchanged, and
        // is left exactly as stored. Otherwise email is a full replace
        // (see the comment above) - whenever it actually changes
        // (including clearing it to null), any prior verification no
        // longer applies to whatever's on file now, so this must be
        // re-verified via POST /me/email/send-verification.
        ...(hasVerifiedEmail
          ? {}
          : { email, ...(email !== currentEmail ? { emailVerifiedAt: null } : {}) }),
      },
    });

    const body: ApiResponse<{ user: SharedUser }> = {
      success: true,
      data: { user: toSharedUser(updated) },
    };
    res.json(body);
  } catch (err) {
    // Unique constraint violation on email (or, in a race past the
    // pre-check above, phone) - Prisma error code P2002, checked
    // structurally rather than importing PrismaClientKnownRequestError,
    // matching the loose Prisma-error handling already used elsewhere in
    // this codebase (see the theaterLocation catch in POST /api/listings).
    if (isUniqueViolation(err)) {
      const body: ApiResponse<never> = {
        success: false,
        error: "That email or phone number is already in use by another account",
      };
      res.status(409).json(body);
      return;
    }
    throw err;
  }
});

// Sends a verification link to this user's *current* email - see
// lib/email (the ConsoleEmailProvider dev stub) and
// lib/emailVerificationStore.ts (the Redis-backed, single-use token,
// same TTL-in-Redis pattern as OTP). The link itself points at the
// frontend (APP_URL), which hits GET /me/email/verify below with the
// token as a query param.
usersRouter.post("/me/email/send-verification", requireAuth, async (req, res) => {
  const email = req.user!.email;
  if (!email) {
    const body: ApiResponse<never> = { success: false, error: "No email on file" };
    res.status(400).json(body);
    return;
  }
  if (req.user!.emailVerifiedAt) {
    const body: ApiResponse<never> = { success: false, error: "Email is already verified" };
    res.status(409).json(body);
    return;
  }

  const token = await issueEmailVerificationToken(req.user!.id, email);
  const link = `${APP_URL}/verify-email?token=${token}`;
  await emailProvider.send(
    email,
    "Verify your GrabMySeats email",
    `Verify your email by visiting: ${link}`,
  );

  const body: ApiResponse<{ message: string }> = {
    success: true,
    data: { message: "Verification email sent" },
  };
  res.json(body);
});

// Single-use link clicked from the email above - deliberately not gated
// behind requireAuth. The token itself (see lib/emailVerificationStore.ts)
// already identifies the user, and the only person who could ever have it
// is whoever received the email, so requiring an active session on top
// would just break the common case of opening the link on a different
// device/browser than the one that's signed in. Still re-checks the
// token's email against the user's *current* email (not just that the
// token itself is valid/unexpired), so a token issued for an old address
// can never verify a new one after an intervening PATCH /me/profile email
// change.
usersRouter.get("/me/email/verify", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token) {
    const body: ApiResponse<never> = { success: false, error: "token is required" };
    res.status(400).json(body);
    return;
  }

  const payload = await consumeEmailVerificationToken(token);
  const user = payload ? await prisma.user.findUnique({ where: { id: payload.userId } }) : null;
  if (!payload || !user || user.email !== payload.email) {
    const body: ApiResponse<never> = { success: false, error: "Invalid or expired token" };
    res.status(401).json(body);
    return;
  }

  // Clicking the link proves ownership, so this goes through the same
  // claim as login: any other account's unverified claim on the address is
  // cleared, and it's refused if another account already has it verified.
  let updated;
  try {
    updated = await claimVerifiedEmail(user.id, user.email);
  } catch (err) {
    if (err instanceof EmailOwnedByAnotherAccountError || isUniqueViolation(err)) {
      const body: ApiResponse<never> = {
        success: false,
        error: "That email is already the sign-in email for another account",
      };
      res.status(409).json(body);
      return;
    }
    throw err;
  }

  const body: ApiResponse<{ user: SharedUser }> = {
    success: true,
    data: { user: toSharedUser(updated) },
  };
  res.json(body);
});

const CLAIM_CODE_RE = /^\d{6}$/;

// Step 1 of making an address this account's verified login identity -
// used by the "add an email to keep access" banner (accounts with no
// verified email) and by "Change email" on the profile page. Nothing is
// written to the account until /claim/verify below proves ownership.
// Same mail-relay protections as POST /api/auth/otp/request (layered rate
// limits, fixed message body, send not awaited), and the same response
// whatever the address - whether some other account holds it is only
// revealed once the caller has proven they own it.
usersRouter.post(
  "/me/email/claim/request",
  requireAuth,
  otpEmailLimiter,
  otpEmailDailyLimiter,
  otpIpLimiter,
  otpGlobalLimiter,
  async (req, res) => {
    const email = normalizeLoginEmail(req.body?.email);
    if (!email) {
      const body: ApiResponse<never> = { success: false, error: "Enter a valid email address" };
      res.status(400).json(body);
      return;
    }

    const code = await issueOtp(claimOtpIdentifier(req.user!.id, email));
    sendOtpEmail(email, code).catch((err) => {
      console.error("[users] failed to send add-email code", err);
    });

    const body: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: "If that address can receive email, a code is on its way" },
    };
    res.json(body);
  },
);

// Step 2: the code proves ownership, so the address becomes this account's
// verified email - replacing whatever email it had - and any other
// account's unverified claim on it is cleared (lib/emailIdentity.ts's
// claimVerifiedEmail). Refused if a different account already has it
// verified: that's an existing login identity, not something to take over.
usersRouter.post("/me/email/claim/verify", requireAuth, async (req, res) => {
  const email = normalizeLoginEmail(req.body?.email);
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
  if (!email || !CLAIM_CODE_RE.test(code)) {
    const body: ApiResponse<never> = { success: false, error: "email and code are required" };
    res.status(400).json(body);
    return;
  }

  if (!(await verifyOtp(claimOtpIdentifier(req.user!.id, email), code))) {
    const body: ApiResponse<never> = { success: false, error: "Invalid or expired code" };
    res.status(401).json(body);
    return;
  }

  try {
    const updated = await claimVerifiedEmail(req.user!.id, email);
    const body: ApiResponse<{ user: SharedUser }> = {
      success: true,
      data: { user: toSharedUser(updated) },
    };
    res.json(body);
  } catch (err) {
    if (err instanceof EmailOwnedByAnotherAccountError || isUniqueViolation(err)) {
      const body: ApiResponse<never> = {
        success: false,
        error: "That email is already the sign-in email for another account",
      };
      res.status(409).json(body);
      return;
    }
    throw err;
  }
});

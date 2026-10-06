import { Router } from "express";
import type { ApiResponse, User as SharedUser } from "@grabmyseats/shared";
import { prisma } from "../lib/prisma";
import { issueOtp, verifyOtp } from "../lib/otpStore";
import { sendOtpEmail } from "../lib/email";
import { issueSessionToken } from "../lib/session";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "../lib/authConfig";
import { toSharedUser } from "../lib/serialize";
import { requireAuth } from "../middleware/auth";
import {
  otpEmailLimiter,
  otpEmailDailyLimiter,
  otpIpLimiter,
  otpGlobalLimiter,
} from "../middleware/rateLimit";
import { generateUniqueReferralCode } from "../lib/referral";
import { normalizeLoginEmail, PHONE_RE } from "../lib/validators";
import {
  clearUnverifiedEmailClaims,
  findUserByVerifiedEmail,
  isUniqueViolation,
  loginOtpIdentifier,
} from "../lib/emailIdentity";

export const authRouter = Router();

const CODE_RE = /^\d{6}$/;

// Email is the login identity (SMS OTP delivery is not wired up - see
// lib/sms). The response is identical whether or not an account exists for
// the address - a new email simply becomes an account at /otp/verify - so
// this can't be used to enumerate accounts. The mail is sent without
// awaiting it for the same reason: SMTP latency or failure must not be
// observable in the response. Rate limits are layered per inbox, per IP and
// globally - see middleware/rateLimit.ts.
authRouter.post(
  "/otp/request",
  otpEmailLimiter,
  otpEmailDailyLimiter,
  otpIpLimiter,
  otpGlobalLimiter,
  async (req, res) => {
    const email = normalizeLoginEmail(req.body?.email);

    if (!email) {
      const body: ApiResponse<never> = {
        success: false,
        error: "Enter a valid email address",
      };
      res.status(400).json(body);
      return;
    }

    const code = await issueOtp(loginOtpIdentifier(email));
    sendOtpEmail(email, code).catch((err) => {
      console.error("[auth] failed to send login code email", err);
    });

    const body: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: "If that address can receive email, a code is on its way" },
    };
    res.json(body);
  },
);

authRouter.post("/otp/verify", async (req, res) => {
  const email = normalizeLoginEmail(req.body?.email);
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";

  if (!email || !CODE_RE.test(code)) {
    const body: ApiResponse<never> = {
      success: false,
      error: "email and code are required",
    };
    res.status(400).json(body);
    return;
  }

  // DEV-ONLY escape hatch so local/dev clients can sign in without wiring
  // up real email delivery. Gated on NODE_ENV so it can never fire in
  // production even if DEV_OTP_BYPASS_CODE is left set in an env file -
  // see the matching startup check in index.ts, which refuses to boot in
  // production if that var is set at all. This must never be reachable in
  // production under any circumstance.
  const devBypassCode = process.env.DEV_OTP_BYPASS_CODE;
  const isDevBypass =
    process.env.NODE_ENV !== "production" &&
    !!devBypassCode &&
    code === devBypassCode;

  if (isDevBypass) {
    console.log(`[dev] bypass OTP used for ${email}`);
  } else if (!(await verifyOtp(loginOtpIdentifier(email), code))) {
    const body: ApiResponse<never> = {
      success: false,
      error: "Invalid or expired code",
    };
    res.status(401).json(body);
    return;
  }

  // The caller has now proven they own `email`. It logs into the account
  // that has it *verified* - never one that merely lists it unverified
  // (see lib/emailIdentity.ts). With no verified owner, it's a signup: the
  // new account gets the email verified, and any other account's
  // unverified claim on the same address is cleared (the proven owner
  // wins). Signup vs login also matters for referral linking below - ?ref=
  // must only ever apply to a brand-new account, never backfill onto an
  // existing one logging back in - which is why this isn't an upsert.
  let user = await findUserByVerifiedEmail(email);
  let isNewAccount = false;

  if (user) {
    // A case-variant unverified duplicate on another account (only
    // possible for rows that predate lowercased storage) loses too.
    await clearUnverifiedEmailClaims(prisma, email, user.id);
  } else {
    // Resolves silently (no error) if the code is missing, malformed, or
    // just doesn't match anyone - a bad/stale referral link should never
    // block signup, it should just fail to credit anyone.
    const refCode = typeof req.body?.ref === "string" ? req.body.ref.trim() : "";
    const referrer = refCode
      ? await prisma.user.findUnique({ where: { referralCode: refCode }, select: { id: true } })
      : null;
    const referralCode = await generateUniqueReferralCode();

    try {
      user = await prisma.$transaction(async (tx) => {
        // Re-checked inside the transaction: someone may have verified
        // this address since the lookup above.
        const owner = await findUserByVerifiedEmail(email, tx);
        if (owner) return owner;

        await clearUnverifiedEmailClaims(tx, email, null);
        isNewAccount = true;
        return tx.user.create({
          data: {
            email,
            emailVerifiedAt: new Date(),
            referralCode,
            referredByUserId: referrer?.id ?? null,
          },
        });
      });
    } catch (err) {
      // A concurrent verify for the same new address won the create -
      // log into that account instead.
      if (!isUniqueViolation(err)) throw err;
      isNewAccount = false;
      user = await findUserByVerifiedEmail(email);
      if (!user) throw err;
    }
  }

  // A brand-new upsert can never be suspended, so this only ever fires for
  // an existing suspended user trying to log back in - same clear-message
  // requirement as requireAuth (middleware/auth.ts), which this route
  // never reaches (issuing the session is the whole point of this
  // endpoint, so it has to check for itself).
  if (user.suspendedAt) {
    const body: ApiResponse<never> = {
      success: false,
      error: user.suspensionReason
        ? `Your account has been suspended: ${user.suspensionReason}`
        : "Your account has been suspended.",
    };
    res.status(403).json(body);
    return;
  }

  // Every successful verify, not just first-time signup - see the
  // lastLoginAt comment on the User model. Not folded into the upsert
  // above since a brand-new signup and a returning login should both set
  // it "now", but the upsert's `create`/`update` branches would otherwise
  // need this repeated in both.
  const loggedInUser = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const token = await issueSessionToken(loggedInUser);

  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS * 1000,
    path: "/",
  });

  // Lets the frontend show the one-time "complete your profile" step
  // (POST /complete-profile below) right after a brand-new signup, and
  // skip straight through for a returning user's login - see
  // frontend/src/app/login/verify/page.tsx. Everything else about this
  // response, and about the login flow itself, is unchanged.
  const body: ApiResponse<{ user: SharedUser; token: string; isNewAccount: boolean }> = {
    success: true,
    data: { user: toSharedUser(loggedInUser), token, isNewAccount },
  };
  res.json(body);
});

// One-time onboarding step immediately after a brand-new signup (see
// isNewAccount above) - collects the display name (used everywhere a
// counterparty sees this user: TransactionContact, session tokens,
// toSharedUser) that email-OTP signup never asks for otherwise, plus an
// optional phone number. Phone is required to sell (POST /api/listings
// enforces it) but never verified - it's self-reported, and shown as
// "Unverified" wherever it's revealed. Email isn't collected here: it's
// already the verified login identity from /otp/verify. Deliberately not
// folded into PATCH /api/users/me/profile (which edits fullName/
// dateOfBirth/etc, a separate, later-in-the-relationship set of fields):
// gated on name being unset, so it can only ever run once, right after
// signup.
authRouter.post("/complete-profile", requireAuth, async (req, res) => {
  if (req.user!.name) {
    const body: ApiResponse<never> = {
      success: false,
      error: "Profile already completed",
    };
    res.status(409).json(body);
    return;
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
  const hasWhatsapp = req.body?.hasWhatsapp === true;

  const errors: string[] = [];
  if (!name) errors.push("name is required");
  if (phone && !PHONE_RE.test(phone)) {
    errors.push("phone must include the country code, e.g. +919876543210");
  }
  if (errors.length > 0) {
    const body: ApiResponse<never> = { success: false, error: errors.join("; ") };
    res.status(400).json(body);
    return;
  }

  try {
    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data: { name, ...(phone ? { phone, hasWhatsapp } : {}) },
    });
    const body: ApiResponse<{ user: SharedUser }> = {
      success: true,
      data: { user: toSharedUser(updated) },
    };
    res.json(body);
  } catch (err) {
    // Unique constraint violation on phone - same handling as PATCH
    // /api/users/me/profile.
    if (isUniqueViolation(err)) {
      const body: ApiResponse<never> = {
        success: false,
        error: "That phone number is already in use by another account",
      };
      res.status(409).json(body);
      return;
    }
    throw err;
  }
});

authRouter.get("/me", requireAuth, (req, res) => {
  const body: ApiResponse<{ user: SharedUser }> = {
    success: true,
    data: { user: toSharedUser(req.user!) },
  };
  res.json(body);
});

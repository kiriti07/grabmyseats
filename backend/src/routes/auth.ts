import { Router, type Request, type Response } from "express";
import type {
  ApiResponse,
  AuthOptions,
  OtpVerifyResult,
  User as SharedUser,
} from "@grabmyseats/shared";
import type { User } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { issueOtp, verifyOtp } from "../lib/otpStore";
import { phoneOtpAvailable } from "../lib/sms";
import { otpSendRefusal, sendOtp } from "../lib/otpDelivery";
import { issueSessionToken } from "../lib/session";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "../lib/authConfig";
import { toSharedUser } from "../lib/serialize";
import { requireAuth } from "../middleware/auth";
import {
  otpIdentifierLimiter,
  otpIdentifierDailyLimiter,
  otpIpLimiter,
  otpGlobalLimiter,
  otpVerifyLimiter,
} from "../middleware/rateLimit";
import { generateUniqueReferralCode } from "../lib/referral";
import { parseIdentifierInput, PHONE_RE, type IdentifierInput } from "../lib/validators";
import { requirePhoneVerification, smsAllowedCountryCodes } from "../lib/config";
import {
  clearUnverifiedClaims,
  findUserByVerifiedIdentifier,
  isUniqueViolation,
  loginOtpIdentifier,
} from "../lib/identity";
import { isReviewLoginAttempt, loginReviewAccount } from "../lib/reviewAccess";
import {
  consumePendingSignupToken,
  issuePendingSignupToken,
} from "../lib/pendingSignupStore";

export const authRouter = Router();

const CODE_RE = /^\d{6}$/;

// Which identifiers the sign-in/sign-up screens may offer, and whether
// phone verification is currently required to list/reserve - read from
// here (not a build-time frontend env var) so the two can never drift.
authRouter.get("/options", (_req, res) => {
  const body: ApiResponse<AuthOptions> = {
    success: true,
    data: {
      phoneOtpAvailable: phoneOtpAvailable(),
      requirePhoneVerification: requirePhoneVerification(),
      smsCountryCodes: smsAllowedCountryCodes(),
    },
  };
  res.json(body);
});

// Step 1 of both sign-in and sign-up, for either identifier: { channel:
// "email" | "phone", identifier }. (A bare { email } - what clients sent
// before phone OTP - still works.) The response is identical whether or not
// an account exists for the identifier, so this can't be used to enumerate
// accounts. Rate limits are layered per identifier, per IP and globally per
// channel - see middleware/rateLimit.ts.
authRouter.post(
  "/otp/request",
  otpIdentifierLimiter,
  otpIdentifierDailyLimiter,
  otpIpLimiter,
  otpGlobalLimiter,
  async (req, res) => {
    const input = parseIdentifierInput(req.body);
    const refusal = otpSendRefusal(input);
    if (refusal) {
      const body: ApiResponse<never> = { success: false, error: refusal };
      res.status(400).json(body);
      return;
    }

    const code = await issueOtp(loginOtpIdentifier(input!.channel, input!.value));
    sendOtp(input!, code, "auth");

    const body: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: "If that address or number can receive codes, one is on its way" },
    };
    res.json(body);
  },
);

// Resolves silently (null) if the code is missing, malformed, or just
// doesn't match anyone - a bad/stale referral link should never block
// signup, it should just fail to credit anyone.
async function findReferrerId(ref: unknown): Promise<string | null> {
  const refCode = typeof ref === "string" ? ref.trim() : "";
  if (!refCode) return null;
  const referrer = await prisma.user.findUnique({
    where: { referralCode: refCode },
    select: { id: true },
  });
  return referrer?.id ?? null;
}

// Creates an account for an identifier the caller has just proven they own
// - verified from the start - clearing any other account's unverified
// claim on it (the proven owner wins). If someone verified it in the
// meantime, that account is returned instead, as a login. ?ref= is only
// ever applied here, to a brand-new account - never backfilled onto an
// existing one logging back in.
async function createAccountForVerifiedIdentifier(
  input: IdentifierInput,
  ref: unknown,
): Promise<{ user: User; isNewAccount: boolean }> {
  const referredByUserId = await findReferrerId(ref);
  const referralCode = await generateUniqueReferralCode();
  const now = new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      const owner = await findUserByVerifiedIdentifier(input.channel, input.value, tx);
      if (owner) return { user: owner, isNewAccount: false };

      await clearUnverifiedClaims(tx, input.channel, input.value, null);
      const user = await tx.user.create({
        data: {
          ...(input.channel === "email"
            ? { email: input.value, emailVerifiedAt: now }
            : { phone: input.value, phoneVerifiedAt: now }),
          referralCode,
          referredByUserId,
        },
      });
      return { user, isNewAccount: true };
    });
  } catch (err) {
    // A concurrent verify for the same new identifier won the create -
    // log into that account instead.
    if (!isUniqueViolation(err)) throw err;
    const user = await findUserByVerifiedIdentifier(input.channel, input.value);
    if (!user) throw err;
    return { user, isNewAccount: false };
  }
}

// Issues the session for a user who has just authenticated. Checks
// suspension itself - requireAuth (middleware/auth.ts) never runs on these
// routes, since issuing the session is the whole point of them.
async function completeLogin(
  res: Response,
  user: User,
  isNewAccount: boolean,
): Promise<void> {
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

  // Every successful login, not just first-time signup - see the
  // lastLoginAt comment on the User model.
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

  // isNewAccount lets the frontend send a brand-new account to the
  // one-time /login/welcome step, and a returning user straight through.
  const body: ApiResponse<OtpVerifyResult> = {
    success: true,
    data: { user: toSharedUser(loggedInUser), token, isNewAccount },
  };
  res.json(body);
}

function invalidCode(res: Response): void {
  const body: ApiResponse<never> = { success: false, error: "Invalid or expired code" };
  res.status(401).json(body);
}

// Step 2: { channel, identifier, code, intent: "signin" | "signup", ref? }.
// Once the code proves the caller owns the identifier:
// - an account that has it *verified* is logged into, whatever the intent
//   (an account that merely lists it unverified never is - see
//   lib/identity.ts);
// - otherwise "signup" creates the account right away, while "signin"
//   creates nothing and answers { noAccount, signupToken } - the frontend
//   then offers "create an account?", and POST /signup/confirm redeems the
//   token. Telling the caller there's no account is fine at this point:
//   they've just proven they own the identifier.
// intent defaults to "signup", which is what this endpoint always did
// before sign-in and sign-up were split.
authRouter.post("/otp/verify", otpVerifyLimiter, async (req: Request, res: Response) => {
  const input = parseIdentifierInput(req.body);
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
  const intent = req.body?.intent === "signin" ? "signin" : "signup";

  if (!input || !CODE_RE.test(code)) {
    const body: ApiResponse<never> = {
      success: false,
      error: "identifier and code are required",
    };
    res.status(400).json(body);
    return;
  }

  // Play reviewer login - see lib/reviewAccess.ts. Only ever matches the
  // one REVIEW_EMAIL, and only while both REVIEW_* vars are set.
  if (isReviewLoginAttempt(input, code)) {
    const result = await loginReviewAccount();
    if (!result) {
      invalidCode(res);
      return;
    }
    console.warn(`[review-login] reviewer signed in as ${input.value} from ${req.ip}`);
    await completeLogin(res, result.user, result.isNewAccount);
    return;
  }

  // DEV-ONLY escape hatch so local/dev clients can sign in without wiring
  // up real email/SMS delivery. Gated on NODE_ENV so it can never fire in
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
    console.log(`[dev] bypass OTP used for ${input.channel} ${input.value}`);
  } else if (!(await verifyOtp(loginOtpIdentifier(input.channel, input.value), code))) {
    invalidCode(res);
    return;
  }

  const owner = await findUserByVerifiedIdentifier(input.channel, input.value);
  if (owner) {
    // An email case-variant unverified duplicate on another account (only
    // possible for rows that predate lowercased storage) loses too.
    await clearUnverifiedClaims(prisma, input.channel, input.value, owner.id);
    await completeLogin(res, owner, false);
    return;
  }

  if (intent === "signin") {
    const signupToken = await issuePendingSignupToken(input);
    const body: ApiResponse<OtpVerifyResult> = {
      success: true,
      data: { noAccount: true, signupToken },
    };
    res.json(body);
    return;
  }

  const { user, isNewAccount } = await createAccountForVerifiedIdentifier(input, req.body?.ref);
  await completeLogin(res, user, isNewAccount);
});

// "Create an account?" after a sign-in found none - { signupToken, ref? }.
// The token (single-use, 10 minutes - lib/pendingSignupStore.ts) stands in
// for the code already redeemed at /otp/verify, so no second code is sent.
authRouter.post("/signup/confirm", async (req, res) => {
  const token = typeof req.body?.signupToken === "string" ? req.body.signupToken : "";
  const input = token ? await consumePendingSignupToken(token) : null;
  if (!input) {
    const body: ApiResponse<never> = {
      success: false,
      error: "That sign-up link has expired - request a new code",
    };
    res.status(401).json(body);
    return;
  }

  const { user, isNewAccount } = await createAccountForVerifiedIdentifier(input, req.body?.ref);
  await completeLogin(res, user, isNewAccount);
});

// One-time onboarding step immediately after a brand-new signup (see
// isNewAccount above) - collects the display name (used everywhere a
// counterparty sees this user: TransactionContact, session tokens,
// toSharedUser) that OTP signup never asks for otherwise, plus, for an
// email signup, an optional *unverified* phone number - the fallback for
// when SMS codes aren't available (GET /options); when they are, the
// welcome screen verifies the phone through POST
// /api/users/me/identifiers/claim/* instead. Phone is required to sell
// (POST /api/listings enforces it). hasWhatsapp applies to whichever phone
// ends up on file, including one already verified by a phone signup, which
// this never overwrites. The other identifier is never set here unverified
// as a login identity - see lib/identity.ts. Deliberately not
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
  if (phone && req.user!.phoneVerifiedAt && phone !== req.user!.phone) {
    errors.push("your phone number is already verified");
  }
  if (errors.length > 0) {
    const body: ApiResponse<never> = { success: false, error: errors.join("; ") };
    res.status(400).json(body);
    return;
  }

  try {
    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        name,
        ...(phone ? { phone, hasWhatsapp } : req.user!.phone ? { hasWhatsapp } : {}),
      },
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

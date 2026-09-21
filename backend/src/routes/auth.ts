import { Router } from "express";
import type { ApiResponse, User as SharedUser } from "@grabmyseats/shared";
import { prisma } from "../lib/prisma";
import { issueOtp, verifyOtp } from "../lib/otpStore";
import { smsProvider } from "../lib/sms";
import { issueSessionToken } from "../lib/session";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "../lib/authConfig";
import { toSharedUser } from "../lib/serialize";
import { requireAuth } from "../middleware/auth";
import { otpPhoneLimiter, otpIpLimiter } from "../middleware/rateLimit";
import { generateUniqueReferralCode } from "../lib/referral";
import { isValidEmail } from "../lib/validators";

export const authRouter = Router();

const PHONE_RE = /^\+[1-9]\d{7,14}$/;
const CODE_RE = /^\d{6}$/;

authRouter.post("/otp/request", otpPhoneLimiter, otpIpLimiter, async (req, res) => {
  const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";

  if (!PHONE_RE.test(phone)) {
    const body: ApiResponse<never> = {
      success: false,
      error: "phone must be in E.164 format, e.g. +14155551234",
    };
    res.status(400).json(body);
    return;
  }

  const code = await issueOtp(phone);
  await smsProvider.send(phone, `Your GrabMySeats code is ${code}`);

  const body: ApiResponse<{ message: string }> = {
    success: true,
    data: { message: "OTP sent" },
  };
  res.json(body);
});

authRouter.post("/otp/verify", async (req, res) => {
  const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";

  if (!PHONE_RE.test(phone) || !CODE_RE.test(code)) {
    const body: ApiResponse<never> = {
      success: false,
      error: "phone and code are required",
    };
    res.status(400).json(body);
    return;
  }

  // DEV-ONLY escape hatch so local/dev clients can sign in without wiring
  // up real SMS delivery. Gated on NODE_ENV so it can never fire in
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
    console.log(`[dev] bypass OTP used for ${phone}`);
  } else if (!(await verifyOtp(phone, code))) {
    const body: ApiResponse<never> = {
      success: false,
      error: "Invalid or expired code",
    };
    res.status(401).json(body);
    return;
  }

  // First verified OTP for a phone number signs the user up; subsequent
  // ones log them back in. A plain upsert can't tell those apart (its
  // create/update branches both just return a row), and that distinction
  // is exactly what referral linking needs below - ?ref= must only ever
  // apply to a brand-new account, never backfill onto an existing one
  // logging back in - so this does the existence check itself instead.
  const existingUser = await prisma.user.findUnique({ where: { phone } });
  const isNewAccount = !existingUser;

  let user;
  if (existingUser) {
    user = existingUser;
  } else {
    // Resolves silently (no error) if the code is missing, malformed, or
    // just doesn't match anyone - a bad/stale referral link should never
    // block signup, it should just fail to credit anyone.
    const refCode = typeof req.body?.ref === "string" ? req.body.ref.trim() : "";
    const referrer = refCode
      ? await prisma.user.findUnique({ where: { referralCode: refCode }, select: { id: true } })
      : null;

    user = await prisma.user.create({
      data: {
        phone,
        referralCode: await generateUniqueReferralCode(),
        referredByUserId: referrer?.id ?? null,
      },
    });
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
  // frontend/src/app/login/verify/page.tsx.
  const body: ApiResponse<{ user: SharedUser; token: string; isNewAccount: boolean }> = {
    success: true,
    data: { user: toSharedUser(loggedInUser), token, isNewAccount },
  };
  res.json(body);
});

// One-time onboarding step immediately after a brand-new signup (see
// isNewAccount above) - collects the display name (used everywhere a
// counterparty sees this user: TransactionContact, session tokens,
// toSharedUser) that OTP-only signup never asks for otherwise, plus an
// optional email. Deliberately not folded into PATCH /api/users/me/profile
// (which edits fullName/dateOfBirth/etc, a separate, later-in-the-
// relationship set of fields): gated on name being unset, so it can only
// ever run once, right after signup - a returning user who already has a
// name on file (every existing account does, or will as soon as they
// complete this) can't call it again to reuse it as a lightweight profile
// editor.
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
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";

  const errors: string[] = [];
  if (!name) errors.push("name is required");
  if (email && !isValidEmail(email)) errors.push("email must be a valid email address");
  if (errors.length > 0) {
    const body: ApiResponse<never> = { success: false, error: errors.join("; ") };
    res.status(400).json(body);
    return;
  }

  try {
    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data: { name, ...(email ? { email } : {}) },
    });
    const body: ApiResponse<{ user: SharedUser }> = {
      success: true,
      data: { user: toSharedUser(updated) },
    };
    res.json(body);
  } catch (err) {
    // Unique constraint violation on email (Prisma error code P2002) - same
    // handling as PATCH /api/users/me/profile.
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      const body: ApiResponse<never> = {
        success: false,
        error: "That email is already in use by another account",
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

import { timingSafeEqual } from "node:crypto";
import type { User } from "../generated/prisma/client";
import { prisma } from "./prisma";
import { generateUniqueReferralCode } from "./referral";
import { normalizeLoginEmail, type IdentifierInput } from "./validators";

// Play Store reviewer login. Reviewers can't receive a code, so while both
// REVIEW_EMAIL and REVIEW_OTP are set, POST /api/auth/otp/verify accepts
// REVIEW_OTP for exactly that one email - never any other email, never a
// phone, and never in the add-identifier flow. Deliberately separate from
// DEV_OTP_BYPASS_CODE, whose production guard (index.ts) is unrelated and
// unchanged.
//
// Removing either env var switches all of it off: env is read per call
// (not cached), the account's verified status is computed here at runtime
// rather than stored (emailVerifiedAt/phoneVerifiedAt are never set for
// it), and attachUser (middleware/auth.ts) drops a review account's
// session while the path is off - so nothing persisted outlives the vars.

export interface ReviewLoginConfig {
  email: string;
  code: string;
}

// The fixed code never changes and is consumed by nothing, so it must not
// be guessable - see also the per-identifier limit on /otp/verify.
export function isAcceptableReviewCode(code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  if (/^(\d)\1{5}$/.test(code)) return false;
  return !["123456", "654321", "012345", "543210", "123123", "121212"].includes(code);
}

// null (= path disabled) unless both vars are set and valid. Invalid values
// also refuse to boot - see checkReviewLoginConfigAtStartup.
export function reviewLoginConfig(): ReviewLoginConfig | null {
  const email = normalizeLoginEmail(process.env.REVIEW_EMAIL);
  const code = process.env.REVIEW_OTP;
  if (!email || !code || !isAcceptableReviewCode(code)) return null;
  return { email, code };
}

export function checkReviewLoginConfigAtStartup(): void {
  const rawEmail = process.env.REVIEW_EMAIL;
  const code = process.env.REVIEW_OTP;
  if (!rawEmail && !code) return;
  if (!rawEmail || !code) {
    console.warn(
      "[review-login] only one of REVIEW_EMAIL/REVIEW_OTP is set - reviewer login is DISABLED",
    );
    return;
  }
  const email = normalizeLoginEmail(rawEmail);
  if (!email) throw new Error("REVIEW_EMAIL is not a valid email address");
  if (!isAcceptableReviewCode(code)) {
    throw new Error("REVIEW_OTP must be 6 digits and not a trivially guessable code");
  }
  console.warn(
    `[review-login] ENABLED for ${email} - unset REVIEW_EMAIL/REVIEW_OTP to disable`,
  );
}

function codesEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function isReviewLoginAttempt(input: IdentifierInput, code: string): boolean {
  const config = reviewLoginConfig();
  return (
    !!config &&
    input.channel === "email" &&
    input.value === config.email &&
    codesEqual(code, config.code)
  );
}

// Whether this user is the reviewer account *and* the review path is
// currently on - the only condition under which it counts as email- and
// phone-verified (lib/serialize.ts, lib/verificationGate.ts) or may keep a
// session (middleware/auth.ts).
export function isActiveReviewAccount(user: {
  isReviewAccount: boolean;
  email: string | null;
}): boolean {
  const config = reviewLoginConfig();
  return !!config && user.isReviewAccount && user.email?.toLowerCase() === config.email;
}

// Signs into (or creates) the one account flagged isReviewAccount, with
// REVIEW_EMAIL as its email. Never touches a regular account: if one
// already holds that address - verified or not - this refuses (null) rather
// than signing the reviewer into someone else's account or clearing their
// claim, and logs why.
export async function loginReviewAccount(): Promise<{ user: User; isNewAccount: boolean } | null> {
  const config = reviewLoginConfig();
  if (!config) return null;
  const referralCode = await generateUniqueReferralCode();

  return prisma.$transaction(async (tx) => {
    const regularHolder = await tx.user.findFirst({
      where: {
        email: { equals: config.email, mode: "insensitive" },
        isReviewAccount: false,
      },
      select: { id: true },
    });
    if (regularHolder) {
      console.warn(
        `[review-login] REFUSED: ${config.email} belongs to regular account ` +
          `${regularHolder.id} - not signing the reviewer into it. ` +
          "Point REVIEW_EMAIL at an unused address.",
      );
      return null;
    }

    const existing = await tx.user.findFirst({
      where: { isReviewAccount: true },
      orderBy: { createdAt: "asc" },
    });
    if (existing) {
      const user =
        existing.email === config.email
          ? existing
          : await tx.user.update({ where: { id: existing.id }, data: { email: config.email } });
      return { user, isNewAccount: false };
    }

    const user = await tx.user.create({
      data: { email: config.email, isReviewAccount: true, referralCode },
    });
    return { user, isNewAccount: true };
  });
}

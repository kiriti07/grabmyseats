import { randomUUID } from "node:crypto";
import { redis } from "./redis";

// Longer-lived than an OTP code (otpStore.ts's 5 minutes) since this is a
// link a user has to find in their inbox and click, not a code they're
// actively waiting to type in.
const EMAIL_VERIFY_TTL_SECONDS = 60 * 60; // 1 hour

function tokenKey(token: string): string {
  return `email-verify:${token}`;
}

export interface EmailVerificationPayload {
  userId: string;
  // The email this token was issued for - checked against the user's
  // *current* email on verify (see GET /api/users/me/email/verify), so a
  // token issued before an intervening PATCH /api/users/me/profile email
  // change can never end up verifying the new address.
  email: string;
}

export async function issueEmailVerificationToken(
  userId: string,
  email: string,
): Promise<string> {
  const token = randomUUID();
  await redis.set(
    tokenKey(token),
    JSON.stringify({ userId, email }),
    "EX",
    EMAIL_VERIFY_TTL_SECONDS,
  );
  return token;
}

export async function consumeEmailVerificationToken(
  token: string,
): Promise<EmailVerificationPayload | null> {
  const key = tokenKey(token);
  const stored = await redis.get(key);
  if (stored === null) return null;

  // Always consume the attempt so a token can't be reused or brute-forced,
  // same discipline as verifyOtp in otpStore.ts.
  await redis.del(key);

  return JSON.parse(stored) as EmailVerificationPayload;
}

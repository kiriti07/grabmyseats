import { randomInt } from "node:crypto";
import { redis } from "./redis";

const OTP_TTL_SECONDS = 5 * 60;
const OTP_LENGTH = 6;

// identifier is whatever the code was sent to - a normalized email for
// login (routes/auth.ts), or a userId-scoped email for the add-email flow
// (routes/users.ts), so a code can only ever be redeemed for the exact
// purpose it was issued for.
function otpKey(identifier: string): string {
  return `otp:${identifier}`;
}

function generateCode(): string {
  return randomInt(10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, "0");
}

export async function issueOtp(identifier: string): Promise<string> {
  const code = generateCode();
  await redis.set(otpKey(identifier), code, "EX", OTP_TTL_SECONDS);
  return code;
}

export async function verifyOtp(identifier: string, code: string): Promise<boolean> {
  const key = otpKey(identifier);
  const stored = await redis.get(key);
  if (stored === null) return false;

  // Always consume the attempt so a code can't be reused or brute-forced.
  await redis.del(key);

  return stored === code;
}

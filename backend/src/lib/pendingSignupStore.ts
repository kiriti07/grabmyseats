import { randomUUID } from "node:crypto";
import { redis } from "./redis";
import type { IdentifierInput } from "./validators";

// "No account for this identifier - create one?" (POST /api/auth/otp/verify
// with intent "signin"). The code was already redeemed proving ownership,
// so this short-lived, single-use token carries that proof to POST
// /api/auth/signup/confirm without asking for a second code.
const PENDING_SIGNUP_TTL_SECONDS = 10 * 60;

function tokenKey(token: string): string {
  return `signup-pending:${token}`;
}

export async function issuePendingSignupToken(identifier: IdentifierInput): Promise<string> {
  const token = randomUUID();
  await redis.set(tokenKey(token), JSON.stringify(identifier), "EX", PENDING_SIGNUP_TTL_SECONDS);
  return token;
}

export async function consumePendingSignupToken(token: string): Promise<IdentifierInput | null> {
  // GETDEL, so two concurrent confirms can't both spend one token.
  const stored = await redis.getdel(tokenKey(token));
  if (stored === null) return null;
  return JSON.parse(stored) as IdentifierInput;
}

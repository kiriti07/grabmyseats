import { createHmac } from "node:crypto";
import type { IdentifierChannel } from "./validators";

// DeletedIdentifier.hash: HMAC-SHA256 of a deleted, suspended account's
// email or phone, keyed by IDENTIFIER_HASH_SECRET - so a sign-up with the
// same identifier can be recognised and refused (lib/accountDeletion.ts)
// without the identifier itself being kept. Only suspended accounts are
// ever hashed. Changing the secret makes stored hashes unmatchable, i.e.
// silently lifts every such block.

export class IdentifierHashConfigError extends Error {
  constructor() {
    super("IDENTIFIER_HASH_SECRET is not set (or shorter than 32 characters)");
  }
}

const MIN_SECRET_LENGTH = 32;

export function isIdentifierHashConfigured(): boolean {
  return (process.env.IDENTIFIER_HASH_SECRET?.length ?? 0) >= MIN_SECRET_LENGTH;
}

// Emails compare case-insensitively everywhere (lib/identity.ts), so they're
// hashed lowercased; phones are stored normalized E.164 and hashed as-is.
// The channel is part of the input, so an email and a phone never collide.
// No fallback secret, ever: a missing one throws (and, in production, stops
// startup - see index.ts).
export function identifierHash(channel: IdentifierChannel, value: string): string {
  const secret = process.env.IDENTIFIER_HASH_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) throw new IdentifierHashConfigError();
  const normalized = channel === "email" ? value.trim().toLowerCase() : value.trim();
  return createHmac("sha256", secret).update(`${channel}:${normalized}`, "utf8").digest("hex");
}

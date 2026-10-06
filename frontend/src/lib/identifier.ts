import type { IdentifierChannel } from "@grabmyseats/shared";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+[1-9]\d{7,14}$/;

// Client-side mirror of the backend's normalizeLoginEmail/normalizeLoginPhone
// (backend/src/lib/validators.ts): email trimmed + lowercased, phone as
// E.164 with spaces/dashes/parentheses dropped. Only for early feedback and
// for showing the user the exact form a code went to - the backend
// re-validates everything. null when invalid.
export function normalizeIdentifier(channel: IdentifierChannel, raw: string): string | null {
  if (channel === "email") {
    const email = raw.trim().toLowerCase();
    return EMAIL_RE.test(email) ? email : null;
  }
  const phone = raw.trim().replace(/[\s\-()]/g, "");
  return PHONE_RE.test(phone) ? phone : null;
}

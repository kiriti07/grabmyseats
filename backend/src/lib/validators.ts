// Deliberately loose (no full RFC 5322 parsing) - just enough to catch
// obvious typos on the profile form (PATCH /api/users/me/profile) without
// rejecting real addresses a stricter regex might choke on.
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// RFC 5321's practical upper bound on a full address.
const MAX_EMAIL_LENGTH = 254;

// Canonical stored/lookup form of an email that's used as a login identity
// (POST /api/auth/otp/*, the /api/users/me/email/claim flow): trimmed and
// lowercased, so "Priya@Example.com" and "priya@example.com" are one
// identity. Returns null for anything that shouldn't ever reach the mailer -
// on top of isValidEmail, that means over-long input and any CR/LF/control
// character (header injection: the address ends up in the SMTP envelope and
// the To: header).
export function normalizeLoginEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(email)) return null;
  return isValidEmail(email) ? email : null;
}

// Rate-limit key for an email (see middleware/rateLimit.ts) - NOT a storage
// or lookup form. Drops a "+tag" from the local part so victim+1@x.com,
// victim+2@x.com, ... (all the same inbox for most providers) share one
// budget instead of each getting their own.
export function emailRateLimitKey(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.split("+")[0]}@${domain}`;
}

// Strict E.164 ("+<countrycode><digits>", no spaces/formatting) - phone is
// rendered straight into tel: and wa.me links at contact reveal.
export const PHONE_RE = /^\+[1-9]\d{7,14}$/;

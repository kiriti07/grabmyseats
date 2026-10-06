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

// Canonical stored/lookup form of a phone used as a login identity: E.164
// after dropping the spaces, dashes and parentheses people type. Unlike
// email there's no case to fold, so stored phones match exactly.
export function normalizeLoginPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const phone = value.trim().replace(/[\s\-()]/g, "");
  return PHONE_RE.test(phone) ? phone : null;
}

export function isPhoneCountryAllowed(phone: string, countryCodes: string[]): boolean {
  return countryCodes.some((cc) => phone.startsWith(`+${cc}`));
}

export type IdentifierChannel = "email" | "phone";

export interface IdentifierInput {
  channel: IdentifierChannel;
  value: string;
}

// Reads { channel, identifier } off an OTP request body, normalized for its
// channel. A body with no channel/identifier but an `email` field - the
// shape every client sent before phone OTP existed - reads as an email
// identifier, so those keep working unchanged.
export function parseIdentifierInput(body: unknown): IdentifierInput | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const channel: IdentifierChannel = b.channel === "phone" ? "phone" : "email";
  const raw = b.identifier ?? (channel === "email" ? b.email : b.phone);
  const value = channel === "email" ? normalizeLoginEmail(raw) : normalizeLoginPhone(raw);
  return value ? { channel, value } : null;
}

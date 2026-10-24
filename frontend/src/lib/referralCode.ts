// Invite (referral) codes on the sign-up screens. Sign-up can be invite-only
// (GET /api/auth/options -> requireReferral), and people who install the app
// never arrive through a /signup?ref= link, so the code can also be typed.

const STORAGE_KEY = "gms.inviteCode";

// Client-side mirror of the backend's normalizeReferralCode (backend/src/lib/
// referral.ts): trimmed, inner spaces and dashes dropped, uppercased. The
// backend re-checks everything; this is only so the field and the stored
// value look like the code people were given.
export function normalizeReferralCode(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.trim().toUpperCase().replace(/[\s-]/g, "");
}

// Only a code the backend has said is valid gets saved, so leaving the
// sign-up screen (or reloading the app) doesn't lose it. Storage can be
// unavailable (private mode, blocked site data) - then it's just not kept.
export function loadSavedReferralCode(): string {
  try {
    return normalizeReferralCode(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "";
  }
}

export function saveReferralCode(code: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, normalizeReferralCode(code));
  } catch {
    // not kept - the code still travels in the URL for this sign-up
  }
}

// Once an account exists the code has done its job; a later sign-up on the
// same device shouldn't silently reuse it.
export function clearSavedReferralCode(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing to clear
  }
}

export const INVITE_REQUIRED_MESSAGE =
  "GrabMySeats is invite-only right now. Enter the invite code a friend shared with you.";
export const INVITE_INVALID_MESSAGE =
  "This invite link isn't valid anymore. Ask the person who invited you for their current code.";

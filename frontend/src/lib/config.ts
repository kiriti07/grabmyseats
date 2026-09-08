export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const TOKEN_COOKIE_NAME = "gms_token";

// Mirrors SESSION_MAX_AGE_SECONDS in backend/src/lib/authConfig.ts, since
// the value we store is that same session token.
export const TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

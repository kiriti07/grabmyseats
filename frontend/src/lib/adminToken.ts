import { ADMIN_TOKEN_COOKIE_NAME, ADMIN_TOKEN_MAX_AGE_SECONDS } from "./adminConfig";

// Same reasoning as lib/token.ts (the customer equivalent): the backend's
// httpOnly admin_session cookie is scoped to its own origin with no
// cross-origin guarantee, so the frontend keeps its own copy of the
// bearer token returned by POST /api/admin/auth/login in a plain cookie -
// a distinct one from the customer's, so middleware.ts's /admin/* check
// can never be satisfied by a customer session or vice versa.
export function setAdminToken(token: string): void {
  if (typeof document === "undefined") return;
  document.cookie = [
    `${ADMIN_TOKEN_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "path=/",
    `max-age=${ADMIN_TOKEN_MAX_AGE_SECONDS}`,
    "samesite=lax",
  ].join("; ");
}

export function getAdminToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${ADMIN_TOKEN_COOKIE_NAME}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export function clearAdminToken(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${ADMIN_TOKEN_COOKIE_NAME}=; path=/; max-age=0`;
}

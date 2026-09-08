import { TOKEN_COOKIE_NAME, TOKEN_MAX_AGE_SECONDS } from "./config";

// The backend's httpOnly session cookie is scoped to its own origin and
// there's no logout endpoint to clear it, so the frontend keeps its own
// copy of the bearer token returned by /otp/verify in a plain cookie.
// That's what lets middleware.ts (which only ever sees cookies, never
// localStorage) gate routes on the server.
export function setToken(token: string): void {
  if (typeof document === "undefined") return;
  document.cookie = [
    `${TOKEN_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "path=/",
    `max-age=${TOKEN_MAX_AGE_SECONDS}`,
    "samesite=lax",
  ].join("; ");
}

export function getToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${TOKEN_COOKIE_NAME}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export function clearToken(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${TOKEN_COOKIE_NAME}=; path=/; max-age=0`;
}

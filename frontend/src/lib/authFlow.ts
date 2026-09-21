import type { User } from "@grabmyseats/shared";

// Only ever a same-origin path forwarded from useRequireAuth.ts/
// middleware.ts's own `next` params (or /login/verify's own `next`,
// carried one step further to /login/welcome) - never trust it as a full
// URL. An absolute or protocol-relative value here would be an open
// redirect straight after login/signup.
export function safeNextPath(next: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/";
}

// A brand-new signup never has `name` set (OTP-only signup collects
// nothing but a phone number - see POST /api/auth/otp/verify) - it's only
// ever set once, by POST /api/auth/complete-profile. Route guards
// (useRequireAuth.ts, account/page.tsx) use this to bounce a user who
// hasn't finished that step back to /login/welcome, regardless of how
// they got authenticated (fresh signup, a later login before finishing,
// or navigating straight to a protected URL) - so the step can't be
// skipped by closing the tab and coming back.
export function isProfileIncomplete(user: User | null): boolean {
  return !!user && !user.name;
}

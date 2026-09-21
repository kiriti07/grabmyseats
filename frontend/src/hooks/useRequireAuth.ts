"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { isProfileIncomplete } from "@/lib/authFlow";

// Client-side route guard for /buy and /sell: redirects to /login once we
// know for sure there's no session (isLoading false, isAuthenticated
// false). Waiting on isLoading avoids a flash-redirect while
// AuthProvider's initial fetchMe() call is still in flight.
//
// Carries the current path as ?next= - same param name/shape as
// middleware.ts's server-side redirect for /account - so login/verify can
// send the visitor back to, e.g., the exact listing they were trying to
// view (GET /api/listings/:id now requires auth too, so this is the only
// way back there without losing the URL).
//
// Also bounces an authenticated-but-not-yet-named user to /login/welcome
// (see isProfileIncomplete) - this is what makes that step un-skippable:
// even if they abandoned it right after signup, closed the tab, or typed
// a protected URL directly, they land back there instead of into the app.
export function useRequireAuth(): { isAuthenticated: boolean; isLoading: boolean; isReady: boolean } {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const needsProfile = isAuthenticated && isProfileIncomplete(user);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (needsProfile) {
      router.replace(`/login/welcome?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, isAuthenticated, needsProfile, pathname, router]);

  return { isAuthenticated, isLoading, isReady: !isLoading && isAuthenticated && !needsProfile };
}

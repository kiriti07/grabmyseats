"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

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
export function useRequireAuth(): { isAuthenticated: boolean; isLoading: boolean } {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  return { isAuthenticated, isLoading };
}

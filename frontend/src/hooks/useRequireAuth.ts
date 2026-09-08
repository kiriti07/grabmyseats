"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

// Client-side route guard for /buy and /sell: redirects to /login once we
// know for sure there's no session (isLoading false, isAuthenticated
// false). Waiting on isLoading avoids a flash-redirect while
// AuthProvider's initial fetchMe() call is still in flight.
export function useRequireAuth(): { isAuthenticated: boolean; isLoading: boolean } {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  return { isAuthenticated, isLoading };
}

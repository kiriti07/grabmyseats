"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { startPush } from "@/lib/push";

// Once signed in (Android app only - startPush does nothing elsewhere):
// refreshes this device's push token when permission was already granted,
// and opens the listing (or My Alerts) when a notification is tapped.
// Never asks for permission - that only happens when an alert is created.
export function PushBootstrap() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) return;
    startPush(
      (path) => router.push(path),
      () => window.dispatchEvent(new Event("gms:alert-match")),
    ).catch(() => {});
  }, [isAuthenticated, router]);

  return null;
}

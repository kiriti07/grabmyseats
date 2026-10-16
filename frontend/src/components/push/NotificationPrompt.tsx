"use client";

import { useEffect, useState } from "react";
import { markPushPrompted, pushPermission, requestPushPermission, wasPushPrompted } from "@/lib/push";

type State = "hidden" | "ask" | "asking" | "granted" | "denied";

// Shown right after the first alert is created in the Android app: a short
// explanation first, then Android's own permission prompt only if the user
// taps Allow. Never at app launch, never on the website or in older APKs
// (pushPermission() is "unsupported" there). Denied: matches still show in
// My Alerts, and how to turn notifications on later.
export function NotificationPrompt() {
  const [state, setState] = useState<State>("hidden");

  useEffect(() => {
    let cancelled = false;
    pushPermission()
      .then((permission) => {
        if (cancelled) return;
        if (permission === "prompt" && !wasPushPrompted()) setState("ask");
        else if (permission === "denied") setState("denied");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function allow() {
    markPushPrompted();
    setState("asking");
    try {
      const result = await requestPushPermission();
      setState(result === "granted" ? "granted" : result === "unsupported" ? "hidden" : "denied");
    } catch {
      setState("denied");
    }
  }

  if (state === "hidden") return null;

  return (
    <div className="mt-3 rounded-lg border border-gold/40 bg-gold/5 p-3 text-left text-sm" role="status">
      {state === "ask" || state === "asking" ? (
        <>
          <p className="font-medium text-foreground">Get notified on this phone?</p>
          <p className="mt-1 text-xs text-muted">
            We&apos;ll send a notification when tickets matching your alerts are listed - nothing else.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={allow}
              disabled={state === "asking"}
              className="flex-1 rounded-lg bg-gold px-3 py-2 text-sm font-semibold text-[#1a1408] disabled:opacity-60"
            >
              Allow
            </button>
            <button
              type="button"
              onClick={() => {
                markPushPrompted();
                setState("hidden");
              }}
              disabled={state === "asking"}
              className="flex-1 rounded-lg border border-line px-3 py-2 text-sm font-medium text-foreground"
            >
              Not now
            </button>
          </div>
        </>
      ) : state === "granted" ? (
        <p className="text-success">Notifications are on ✓</p>
      ) : (
        <>
          <p className="font-medium text-foreground">Notifications are off</p>
          <p className="mt-1 text-xs text-muted">
            You&apos;ll still see matches in My Alerts. To get notifications, open your phone&apos;s
            Settings → Apps → GrabMySeats → Notifications and turn them on.
          </p>
          <button type="button" onClick={allow} className="mt-2 text-xs font-medium text-gold">
            Try again
          </button>
        </>
      )}
    </div>
  );
}

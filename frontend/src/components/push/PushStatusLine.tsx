"use client";

import { useEffect, useState } from "react";
import {
  getPushStatus,
  pushStatusText,
  pushSupported,
  refreshPushStatus,
  retryPushRegistration,
  subscribePushStatus,
  type PushStatus,
} from "@/lib/push";

// My Alerts, Android app only: whether this phone will really get
// notifications - the actual result of the permission, register() and
// saving the device on our server (lib/push.ts) - with "Try again".
// Never shows the token.
export function PushStatusLine() {
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<PushStatus>({ state: "unsupported" });
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!pushSupported()) return;
    setSupported(true);
    setStatus(getPushStatus());
    const unsubscribe = subscribePushStatus(setStatus);
    refreshPushStatus().catch(() => {});
    return unsubscribe;
  }, []);

  const text = pushStatusText(status);
  if (!supported || !text) return null;

  async function retry() {
    setRetrying(true);
    try {
      await retryPushRegistration();
    } finally {
      setRetrying(false);
    }
  }

  const busy = retrying || status.state === "registering";
  const tone =
    status.state === "registered" ? "text-success" : status.state === "error" ? "text-error" : "text-muted";

  return (
    <div className="mb-4 rounded-lg border border-line bg-surface px-4 py-3 text-sm" role="status">
      <p className={tone}>{text}</p>
      {status.state === "denied" && (
        <p className="mt-1 text-xs text-muted">
          To turn them on, open your phone&apos;s Settings → Apps → GrabMySeats → Notifications.
        </p>
      )}
      <button
        type="button"
        onClick={retry}
        disabled={busy}
        className="mt-2 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-60"
      >
        {busy ? "Trying…" : "Try again"}
      </button>
    </div>
  );
}

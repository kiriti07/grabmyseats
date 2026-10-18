import type { PushSender } from "./PushSender";
import { FcmPushSender } from "./FcmPushSender";
import { isPushRequested, loadServiceAccount, PushConfigError } from "./config";

export type { PushMessage, PushOutcome, PushSender } from "./PushSender";

let sender: PushSender | null | undefined;

// The sender jobs/matchAlerts.ts uses, or null when push is off - matches
// are then shown in My Alerts only. Built on first use.
export function getPushSender(): PushSender | null {
  if (sender === undefined) {
    sender = null;
    if (isPushRequested()) {
      try {
        sender = new FcmPushSender(loadServiceAccount());
      } catch (err) {
        // Production never gets here with a bad key (index.ts refuses to
        // start); elsewhere push just stays off.
        if (!(err instanceof PushConfigError)) throw err;
        console.warn(`[push] disabled: ${err.message}`);
      }
    }
  }
  return sender;
}

// Tests swap in a fake (src/test/fakePushSender.ts) - never a real FCM call.
export function setPushSender(next: PushSender | null | undefined): void {
  sender = next;
}

// Startup check (index.ts): in production, push that's switched on must have
// a valid key. Returns what the startup log should say.
export function checkPushConfigAtStartup(): "enabled" | "disabled" {
  if (!isPushRequested()) return "disabled";
  try {
    // The key's project, to compare with project_id in the app's
    // google-services.json - a project id isn't secret; nothing else is logged.
    const { projectId } = loadServiceAccount();
    console.log(`[config] PUSH project=${projectId.replace(/[^a-z0-9-]/gi, "?")}`);
    return "enabled";
  } catch (err) {
    if (!(err instanceof PushConfigError)) throw err;
    if (process.env.NODE_ENV === "production") {
      throw new Error(`PUSH_NOTIFICATIONS_ENABLED=true but ${err.message}`);
    }
    console.warn(`[push] ${err.message} - push disabled`);
    return "disabled";
  }
}

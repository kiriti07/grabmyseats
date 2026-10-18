import { cert, initializeApp, type App } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import type { PushMessage, PushOutcome, PushSender } from "./PushSender";
import type { ServiceAccount } from "./config";

// The Android channel the app creates (frontend lib/push.ts) and the icon
// in android/app/src/main/res/drawable. tag makes a newer alert push
// replace an older one on the device instead of stacking.
const ANDROID_CHANNEL_ID = "ticket_alerts";
const ANDROID_TAG = "ticket-alerts";

// A token FCM has told us is gone for good.
const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);
// Temporary trouble on FCM's side - worth another try later.
const RETRYABLE_CODES = new Set([
  "messaging/internal-error",
  "messaging/server-unavailable",
  "messaging/unavailable",
  "messaging/quota-exceeded",
  "messaging/message-rate-exceeded",
  "messaging/device-message-rate-exceeded",
]);

// FCM HTTP v1 via firebase-admin, one message per device (sendEach).
export class FcmPushSender implements PushSender {
  private readonly messaging: Messaging;

  constructor(account: ServiceAccount) {
    const app: App = initializeApp(
      { credential: cert({ projectId: account.projectId, clientEmail: account.clientEmail, privateKey: account.privateKey }) },
      "grabmyseats-push",
    );
    this.messaging = getMessaging(app);
  }

  async send(tokens: string[], message: PushMessage): Promise<{ token: string; outcome: PushOutcome }[]> {
    let response;
    try {
      response = await this.messaging.sendEach(
        tokens.map((token) => ({
          token,
          notification: { title: message.title, body: message.body },
          data: { path: message.path },
          android: {
            priority: "high" as const,
            notification: { channelId: ANDROID_CHANNEL_ID, tag: ANDROID_TAG, icon: "ic_stat_notification" },
          },
        })),
      );
    } catch (err) {
      // No per-device answer (network, timeout): it may or may not have
      // gone out, so it's never retried.
      logSendFailures([err], tokens.length, "no per-device answer, not retried");
      return tokens.map((token) => ({ token, outcome: "unknown" as const }));
    }

    const failures = response.responses.filter((r) => !r.success).map((r) => r.error);
    if (failures.length > 0) logSendFailures(failures);

    return response.responses.map((r, i) => {
      if (r.success) return { token: tokens[i], outcome: "sent" as const };
      const code = r.error?.code ?? "";
      if (INVALID_TOKEN_CODES.has(code)) return { token: tokens[i], outcome: "invalid-token" as const };
      if (RETRYABLE_CODES.has(code)) return { token: tokens[i], outcome: "retryable" as const };
      return { token: tokens[i], outcome: "rejected" as const };
    });
  }
}

// FCM's message, safe for logs: no key, token-like strings, emails or long
// numbers, one line, at most 160 characters.
export function sanitizeFcmMessage(message: unknown): string {
  if (typeof message !== "string") return "";
  const cleaned = message
    .replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, "<key>")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "<email>")
    .replace(/[A-Za-z0-9_:\-]{40,}/g, "<redacted>")
    .replace(/\+?\d[\d\s-]{8,}\d/g, "<number>")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 160 ? `${cleaned.slice(0, 159)}…` : cleaned;
}

// One line per distinct error code, with how many devices got it. The HTTP
// status is only known when firebase-admin puts it in the message (non-JSON
// answers); otherwise the code itself is FCM's precise reason.
function logSendFailures(errors: unknown[], devices?: number, note?: string): void {
  const byCode = new Map<string, { count: number; status: string; message: string }>();
  for (const err of errors) {
    const e = err as { code?: unknown; message?: unknown; name?: unknown } | undefined;
    const code = typeof e?.code === "string" && e.code ? e.code : typeof e?.name === "string" ? e.name : "unknown";
    const message = sanitizeFcmMessage(e?.message);
    const status = /Status code: (\d{3})/.exec(typeof e?.message === "string" ? e.message : "")?.[1] ?? "n/a";
    const entry = byCode.get(code) ?? { count: 0, status, message };
    entry.count += 1;
    byCode.set(code, entry);
  }
  for (const [code, { count, status, message }] of byCode) {
    console.error(
      `[push] send failed: code=${code}, status=${status}, devices=${devices ?? count}` +
        `${note ? ` (${note})` : ""}${message ? ` - ${message}` : ""}`,
    );
  }
}

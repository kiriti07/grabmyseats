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
    } catch {
      // No per-device answer (network, timeout): it may or may not have
      // gone out, so it's never retried.
      return tokens.map((token) => ({ token, outcome: "unknown" as const }));
    }

    return response.responses.map((r, i) => {
      if (r.success) return { token: tokens[i], outcome: "sent" as const };
      const code = r.error?.code ?? "";
      if (INVALID_TOKEN_CODES.has(code)) return { token: tokens[i], outcome: "invalid-token" as const };
      if (RETRYABLE_CODES.has(code)) return { token: tokens[i], outcome: "retryable" as const };
      return { token: tokens[i], outcome: "rejected" as const };
    });
  }
}

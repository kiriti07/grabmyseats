// What a push notification says (no personal data - see jobs/matchAlerts.ts)
// and where tapping it goes, as a path inside the app (e.g. /buy/<id>).
export interface PushMessage {
  title: string;
  body: string;
  path: string;
}

// Per device: delivered; a token FCM says is gone for good (deleted by the
// caller); a temporary failure worth retrying; refused for another reason
// (not retried, token kept); or no answer at all (unknown - never retried,
// so a push can't arrive twice).
export type PushOutcome = "sent" | "invalid-token" | "retryable" | "rejected" | "unknown";

export interface PushSender {
  send(tokens: string[], message: PushMessage): Promise<{ token: string; outcome: PushOutcome }[]>;
}

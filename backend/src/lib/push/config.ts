import { readFileSync } from "node:fs";

// Push notifications (Firebase Cloud Messaging) are off unless
// PUSH_NOTIFICATIONS_ENABLED=true. Then exactly one of these supplies the
// fcm-sender service-account key (never committed, never logged):
// - FIREBASE_SERVICE_ACCOUNT_BASE64: the key JSON, base64-encoded;
// - FIREBASE_SERVICE_ACCOUNT_FILE: a path to the key JSON on the server.
// Deliberately not GOOGLE_APPLICATION_CREDENTIALS, which Cloud Vision uses.
//
// In production, enabled push with a missing or invalid key stops startup
// (index.ts); elsewhere it just leaves push disabled. Error messages name
// the variable, never its value.

export interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

export class PushConfigError extends Error {}

export function isPushRequested(): boolean {
  return process.env.PUSH_NOTIFICATIONS_ENABLED === "true";
}

export function loadServiceAccount(): ServiceAccount {
  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
  const file = process.env.FIREBASE_SERVICE_ACCOUNT_FILE?.trim();
  if (base64 && file) {
    throw new PushConfigError("Set only one of FIREBASE_SERVICE_ACCOUNT_BASE64 and FIREBASE_SERVICE_ACCOUNT_FILE");
  }
  if (!base64 && !file) {
    throw new PushConfigError("FIREBASE_SERVICE_ACCOUNT_BASE64 or FIREBASE_SERVICE_ACCOUNT_FILE must be set");
  }

  let raw: string;
  if (base64) {
    raw = Buffer.from(base64, "base64").toString("utf8");
  } else {
    try {
      raw = readFileSync(file!, "utf8");
    } catch {
      throw new PushConfigError("FIREBASE_SERVICE_ACCOUNT_FILE can't be read");
    }
  }
  const source = base64 ? "FIREBASE_SERVICE_ACCOUNT_BASE64" : "FIREBASE_SERVICE_ACCOUNT_FILE";

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new PushConfigError(`${source} is not a valid service-account JSON`);
  }
  const { type, project_id, client_email, private_key } = json;
  if (
    type !== "service_account" ||
    typeof project_id !== "string" || !project_id ||
    typeof client_email !== "string" || !client_email ||
    typeof private_key !== "string" || !private_key.includes("PRIVATE KEY")
  ) {
    throw new PushConfigError(`${source} is not a valid service-account JSON`);
  }
  return { projectId: project_id, clientEmail: client_email, privateKey: private_key };
}

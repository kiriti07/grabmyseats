import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { registerPushToken, removePushToken } from "@/lib/api";

// Ticket-alert push notifications in the Android app (Firebase Cloud
// Messaging via @capacitor/push-notifications - the only native plugin the
// website code uses).
//
// The app loads this website from grabmyseats.com, so this same code also
// runs in ordinary browsers and in older APKs built before the plugin
// existed. Every call goes through pushSupported() first: inside the
// Android app AND the plugin is present - otherwise nothing happens, and
// alerts still show in My Alerts. (iOS isn't set up for push.)

export type PushPermission = "granted" | "denied" | "prompt" | "unsupported";

const CHANNEL_ID = "ticket_alerts";
const PROMPTED_KEY = "gms_push_prompted";
const TOKEN_KEY = "gms_push_token";
// Where a tapped notification may take the user - nothing else.
const SAFE_PATH = /^\/(buy\/[A-Za-z0-9_-]+|account\/alerts)$/;

export function pushSupported(): boolean {
  try {
    return (
      Capacitor.isNativePlatform() &&
      Capacitor.getPlatform() === "android" &&
      Capacitor.isPluginAvailable("PushNotifications")
    );
  } catch {
    return false;
  }
}

async function plugin() {
  return (await import("@capacitor/push-notifications")).PushNotifications;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export async function pushPermission(): Promise<PushPermission> {
  if (!pushSupported()) return "unsupported";
  const { receive } = await (await plugin()).checkPermissions();
  return receive === "granted" ? "granted" : receive === "denied" ? "denied" : "prompt";
}

// Whether the "get notified on this phone?" explanation has been shown
// (once - when the first alert is created).
export function wasPushPrompted(): boolean {
  return storage()?.getItem(PROMPTED_KEY) === "1";
}

export function markPushPrompted(): void {
  try {
    storage()?.setItem(PROMPTED_KEY, "1");
  } catch {
    // Not fatal - the explanation may just show again.
  }
}

let registrationListeners: Promise<PluginListenerHandle[]> | null = null;

// Gets this device's token (the plugin's "registration" event, fired on
// register() and whenever FCM refreshes it) and sends it to the server for
// the signed-in account.
async function registerDevice(): Promise<void> {
  const push = await plugin();
  registrationListeners ??= Promise.all([
    push.addListener("registration", ({ value }) => {
      try {
        storage()?.setItem(TOKEN_KEY, value);
      } catch {
        // Only needed to remove it on sign-out.
      }
      registerPushToken(value).catch(() => {
        // Retried on the next app start.
      });
    }),
    push.addListener("registrationError", () => {
      // No token this time; matches still show in My Alerts.
    }),
  ]);
  await registrationListeners;
  await push.createChannel({
    id: CHANNEL_ID,
    name: "Ticket alerts",
    description: "When tickets matching your alerts are listed",
    importance: 4,
    visibility: 1,
  });
  await push.register();
}

// Asks Android for notification permission (the system prompt), and
// registers the device if it's granted.
export async function requestPushPermission(): Promise<PushPermission> {
  if (!pushSupported()) return "unsupported";
  const { receive } = await (await plugin()).requestPermissions();
  if (receive !== "granted") return receive === "denied" ? "denied" : "prompt";
  await registerDevice();
  return "granted";
}

let tapListener: Promise<PluginListenerHandle> | null = null;
let foregroundListener: Promise<PluginListenerHandle> | null = null;

// On app start while signed in: re-register if permission is already
// granted (the token may have changed), and open the right page when a
// notification is tapped - also when the tap started the app.
export async function startPush(navigate: (path: string) => void, onForegroundMatch: () => void): Promise<void> {
  if (!pushSupported()) return;
  const push = await plugin();
  tapListener ??= push.addListener("pushNotificationActionPerformed", ({ notification }) => {
    const path = notification.data?.path;
    if (typeof path === "string" && SAFE_PATH.test(path)) navigate(path);
  });
  await tapListener;
  // With the app open Android shows nothing - refresh the My Alerts dot.
  foregroundListener ??= push.addListener("pushNotificationReceived", () => onForegroundMatch());
  await foregroundListener;
  if ((await pushPermission()) === "granted") await registerDevice();
}

// Sign-out: this device stops getting the account's notifications. Needs the
// session, so it runs before the session is cleared.
export async function stopPush(): Promise<void> {
  if (!pushSupported()) return;
  const token = storage()?.getItem(TOKEN_KEY);
  if (token) {
    await removePushToken(token).catch(() => {});
    try {
      storage()?.removeItem(TOKEN_KEY);
    } catch {
      // Nothing to clean up then.
    }
  }
  await (await plugin()).unregister().catch(() => {});
}

export function isSafePushPath(path: string): boolean {
  return SAFE_PATH.test(path);
}

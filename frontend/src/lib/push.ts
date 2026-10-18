import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { ApiError, registerPushToken, removePushToken } from "@/lib/api";

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

// What actually happened to this device's registration (the status line in
// My Alerts): permission, register(), and the POST of the token to our
// server. Never holds the token itself.
export type PushStatus =
  | { state: "unsupported" }
  | { state: "not-registered" }
  | { state: "registering" }
  | { state: "registered" }
  | { state: "denied" }
  | { state: "error"; reason: string };

// No token from Firebase within this long after register() is an error,
// not "still registering" forever.
export const REGISTER_TIMEOUT_MS = 30_000;

let status: PushStatus = { state: "not-registered" };
const statusListeners = new Set<(s: PushStatus) => void>();
let registerTimer: ReturnType<typeof setTimeout> | null = null;

function setStatus(next: PushStatus): void {
  if (next.state !== "registering" && registerTimer) {
    clearTimeout(registerTimer);
    registerTimer = null;
  }
  status = next;
  statusListeners.forEach((fn) => fn(next));
}

export function getPushStatus(): PushStatus {
  return pushSupported() ? status : { state: "unsupported" };
}

export function subscribePushStatus(fn: (s: PushStatus) => void): () => void {
  statusListeners.add(fn);
  return () => void statusListeners.delete(fn);
}

// The My Alerts status line for a status; null where there's no line.
export function pushStatusText(status: PushStatus): string | null {
  switch (status.state) {
    case "unsupported":
      return null;
    case "registered":
      return "Notifications: on (registered)";
    case "denied":
      return "Notifications: permission denied";
    case "not-registered":
    case "registering":
      return "Notifications: not registered yet";
    case "error":
      return `Notifications: error – ${status.reason}`;
  }
}

// A short reason for the status line and the console - never a token (any
// long token-like run is cut out, in case a plugin error quotes one).
export function describePushError(err: unknown): string {
  let reason: string;
  if (err instanceof ApiError) {
    reason =
      err.status === 0 ? "can't reach the server"
        : err.status === 401 ? "not signed in"
          : err.status === 400 ? "server rejected the device (400)"
            : `server error (${err.status})`;
  } else if (err instanceof Error && err.message) {
    reason = err.message;
  } else if (typeof err === "string" && err) {
    reason = err;
  } else {
    reason = "unknown error";
  }
  reason = reason.replace(/[A-Za-z0-9_:\-.]{40,}/g, "…").replace(/\s+/g, " ").trim();
  return reason.length > 80 ? `${reason.slice(0, 79)}…` : reason;
}

function fail(step: string, err: unknown): void {
  const reason = `${step}: ${describePushError(err)}`;
  console.warn(`[push] registration failed - ${reason}`);
  setStatus({ state: "error", reason });
}

async function sendToken(value: string): Promise<void> {
  try {
    storage()?.setItem(TOKEN_KEY, value);
  } catch {
    // Only needed to remove it on sign-out.
  }
  try {
    await registerPushToken(value);
    setStatus({ state: "registered" });
  } catch (err) {
    fail("saving the device", err);
  }
}

let registrationListeners: Promise<PluginListenerHandle[]> | null = null;

// Gets this device's token (the plugin's "registration" event, fired on
// register() and whenever FCM refreshes it) and sends it to the server for
// the signed-in account. Every failure ends in an "error" status.
async function registerDevice(): Promise<void> {
  setStatus({ state: "registering" });
  try {
    const push = await plugin();
    registrationListeners ??= Promise.all([
      push.addListener("registration", ({ value }) => void sendToken(value)),
      push.addListener("registrationError", ({ error }) => fail("Firebase", error)),
    ]);
    await registrationListeners;
    await push.createChannel({
      id: CHANNEL_ID,
      name: "Ticket alerts",
      description: "When tickets matching your alerts are listed",
      importance: 4,
      visibility: 1,
    });
    if (registerTimer) clearTimeout(registerTimer);
    registerTimer = setTimeout(() => {
      registerTimer = null;
      if (status.state === "registering") fail("Firebase", "no token received");
    }, REGISTER_TIMEOUT_MS);
    await push.register();
  } catch (err) {
    fail("register", err);
  }
}

function statusForPermission(permission: Exclude<PushPermission, "granted">): PushStatus {
  return permission === "denied" ? { state: "denied" } : permission === "unsupported" ? { state: "unsupported" } : { state: "not-registered" };
}

// Asks Android for notification permission (the system prompt), and
// registers the device if it's granted.
export async function requestPushPermission(): Promise<PushPermission> {
  if (!pushSupported()) return "unsupported";
  let receive: string;
  try {
    ({ receive } = await (await plugin()).requestPermissions());
  } catch (err) {
    fail("permission", err);
    throw err;
  }
  if (receive !== "granted") {
    const permission = receive === "denied" ? "denied" : "prompt";
    setStatus(statusForPermission(permission));
    return permission;
  }
  await registerDevice();
  return "granted";
}

// My Alerts' status line on open: the permission as Android has it now;
// with permission granted, whatever registration last reported.
export async function refreshPushStatus(): Promise<PushStatus> {
  if (!pushSupported()) return { state: "unsupported" };
  try {
    const permission = await pushPermission();
    if (permission !== "granted") setStatus(statusForPermission(permission));
    else if (status.state === "denied") setStatus({ state: "not-registered" });
  } catch (err) {
    fail("permission", err);
  }
  return status;
}

// "Try again": asks for permission if Android still can, else registers
// again (a new POST of the token). Denied stays denied - only phone
// Settings can change that.
export async function retryPushRegistration(): Promise<PushStatus> {
  if (!pushSupported()) return { state: "unsupported" };
  try {
    const permission = await pushPermission();
    if (permission === "granted") await registerDevice();
    else if (permission === "prompt") await requestPushPermission();
    else setStatus({ state: "denied" });
  } catch (err) {
    if (status.state !== "error") fail("permission", err);
  }
  return status;
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
  const permission = await pushPermission();
  if (permission === "granted") await registerDevice();
  else setStatus(statusForPermission(permission));
}

// Sign-out: this device stops getting the account's notifications. Needs the
// session, so it runs before the session is cleared.
export async function stopPush(): Promise<void> {
  if (!pushSupported()) return;
  const token = storage()?.getItem(TOKEN_KEY);
  if (token) {
    await removePushToken(token).catch((err) => {
      console.warn(`[push] removing the device failed - ${describePushError(err)}`);
    });
    try {
      storage()?.removeItem(TOKEN_KEY);
    } catch {
      // Nothing to clean up then.
    }
  }
  await (await plugin()).unregister().catch((err) => {
    console.warn(`[push] unregister failed - ${describePushError(err)}`);
  });
  setStatus({ state: "not-registered" });
}

export function isSafePushPath(path: string): boolean {
  return SAFE_PATH.test(path);
}

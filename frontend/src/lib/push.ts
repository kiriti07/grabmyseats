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
  const push = await withTimeout(plugin(), "loading the push plugin");
  const { receive } = await withTimeout(push.checkPermissions(), "checking permission");
  return receive === "granted" ? "granted" : receive === "denied" ? "denied" : "prompt";
}

// Every native call in registration gets this long, and so does Firebase to
// send a token after register() - nothing may leave the status line on
// "registering" for ever. (The permission prompt itself has no limit: the
// user may take their time.)
export const REGISTER_TIMEOUT_MS = 15_000;
export const TOKEN_TIMEOUT_REASON = "timed out getting a device token (Google Play services / Firebase config?)";

class StepTimeout extends Error {
  constructor() {
    super("timed out");
  }
}

function withTimeout<T>(promise: Promise<T>, step: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new StepTimeout(), { step })), REGISTER_TIMEOUT_MS);
  });
  return Promise.race([
    promise.catch((err) => {
      throw Object.assign(err instanceof Error ? err : new Error(String(err)), { step });
    }),
    timeout,
  ]).finally(() => clearTimeout(timer));
}

function stepOf(err: unknown): string | null {
  const step = (err as { step?: unknown } | null)?.step;
  return typeof step === "string" ? step : null;
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

let status: PushStatus = { state: "not-registered" };
const statusListeners = new Set<(s: PushStatus) => void>();

function setStatus(next: PushStatus): void {
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
  return reason.length > 120 ? `${reason.slice(0, 119)}…` : reason;
}

// step null: the reason stands alone (Firebase's own registrationError
// message, the token timeout).
function fail(step: string | null, err: unknown): void {
  const reason = step ? `${step}: ${describePushError(err)}` : describePushError(err);
  console.warn(`[push] registration failed - ${reason}`);
  setStatus({ state: "error", reason });
}

// Each registerDevice() run; events and timers of an older run never
// overwrite a newer one's result.
let attempt = 0;
let tokenReceived = false;

async function sendToken(value: string): Promise<void> {
  const mine = attempt;
  tokenReceived = true;
  try {
    storage()?.setItem(TOKEN_KEY, value);
  } catch {
    // Only needed to remove it on sign-out.
  }
  try {
    await registerPushToken(value);
    if (mine === attempt) setStatus({ state: "registered" });
  } catch (err) {
    if (mine === attempt) fail("saving the device", err);
  }
}

function onRegistrationError(error: unknown): void {
  fail(null, error || "registration error from Firebase");
}

let registrationListeners: Promise<PluginListenerHandle[]> | null = null;

// Gets this device's token (the plugin's "registration" event, fired after
// register() and whenever FCM refreshes it - or "registrationError") and
// sends it to the server for the signed-in account. Always ends in
// "registered" or "error" within REGISTER_TIMEOUT_MS per step, and the same
// again for the token after register().
async function registerDevice(): Promise<void> {
  const mine = ++attempt;
  tokenReceived = false;
  setStatus({ state: "registering" });
  try {
    const push = await withTimeout(plugin(), "loading the push plugin");
    registrationListeners ??= Promise.all([
      push.addListener("registration", ({ value }) => void sendToken(value)),
      push.addListener("registrationError", ({ error }) => onRegistrationError(error)),
    ]);
    try {
      await withTimeout(registrationListeners, "adding the token listeners");
    } catch (err) {
      registrationListeners = null; // a stuck or failed attempt is never reused
      throw err;
    }
    await withTimeout(
      push.createChannel({
        id: CHANNEL_ID,
        name: "Ticket alerts",
        description: "When tickets matching your alerts are listed",
        importance: 4,
        visibility: 1,
      }),
      "creating the notification channel",
    );
    // register() returns at once; the token (or the error) comes as an event.
    setTimeout(() => {
      if (mine !== attempt || status.state !== "registering") return;
      if (tokenReceived) fail("saving the device", "no answer from the server");
      else fail(null, TOKEN_TIMEOUT_REASON);
    }, REGISTER_TIMEOUT_MS);
    await withTimeout(push.register(), "register()");
  } catch (err) {
    if (mine === attempt) fail(stepOf(err) ?? "register", err);
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
    fail(stepOf(err) ?? "permission", err);
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
    if (status.state !== "error") fail(stepOf(err) ?? "permission", err);
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
  try {
    const push = await withTimeout(plugin(), "loading the push plugin");
    tapListener ??= push.addListener("pushNotificationActionPerformed", ({ notification }) => {
      const path = notification.data?.path;
      if (typeof path === "string" && SAFE_PATH.test(path)) navigate(path);
    });
    // With the app open Android shows nothing - refresh the My Alerts dot.
    foregroundListener ??= push.addListener("pushNotificationReceived", () => onForegroundMatch());
    await withTimeout(Promise.all([tapListener, foregroundListener]), "adding the notification listeners");
  } catch (err) {
    // Taps may not open the right page, but registration still goes ahead.
    tapListener = null;
    foregroundListener = null;
    console.warn(`[push] ${stepOf(err) ?? "listeners"} failed - ${describePushError(err)}`);
  }
  let permission: PushPermission;
  try {
    permission = await pushPermission();
  } catch (err) {
    fail(stepOf(err) ?? "permission", err);
    return;
  }
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

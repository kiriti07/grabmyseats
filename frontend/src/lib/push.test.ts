import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// lib/push.ts with the Capacitor runtime, the push plugin and our API all
// faked - no device, no FCM, no real tokens.
const runtime = { native: true, platform: "android", pluginAvailable: true };
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => runtime.native,
    getPlatform: () => runtime.platform,
    isPluginAvailable: (name: string) => name === "PushNotifications" && runtime.pluginAvailable,
  },
}));

type Listener = (payload: unknown) => void;
const listeners: Record<string, Listener[]> = {};
const plugin = {
  permission: "prompt" as string,
  checkPermissions: vi.fn(async () => ({ receive: plugin.permission })),
  requestPermissions: vi.fn(async () => ({ receive: plugin.permission })),
  createChannel: vi.fn(async () => {}),
  register: vi.fn(async () => {
    for (const l of listeners.registration ?? []) l({ value: "fake-token-device-1" });
  }),
  unregister: vi.fn(async () => {}),
  addListener: vi.fn(async (event: string, fn: Listener) => {
    (listeners[event] ??= []).push(fn);
    return { remove: async () => {} };
  }),
};
vi.mock("@capacitor/push-notifications", () => ({ PushNotifications: plugin }));

const api = { registerPushToken: vi.fn(async () => ({ registered: true })), removePushToken: vi.fn(async () => ({ removed: true })) };
vi.mock("@/lib/api", () => api);

const store = new Map<string, string>();
const localStorageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

async function freshPush() {
  vi.resetModules();
  return import("./push");
}

describe("push (Android app only)", () => {
  beforeEach(() => {
    Object.assign(runtime, { native: true, platform: "android", pluginAvailable: true });
    plugin.permission = "prompt";
    for (const k of Object.keys(listeners)) delete listeners[k];
    store.clear();
    vi.stubGlobal("window", { localStorage: localStorageStub });
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    ["the website", { native: false, platform: "web", pluginAvailable: false }],
    ["an old APK without the plugin", { native: true, platform: "android", pluginAvailable: false }],
    ["iOS", { native: true, platform: "ios", pluginAvailable: true }],
  ])("does nothing on %s", async (_label, env) => {
    Object.assign(runtime, env);
    const push = await freshPush();
    expect(push.pushSupported()).toBe(false);
    expect(await push.pushPermission()).toBe("unsupported");
    expect(await push.requestPushPermission()).toBe("unsupported");
    await push.startPush(() => {}, () => {});
    await push.stopPush();
    for (const fn of [plugin.checkPermissions, plugin.requestPermissions, plugin.register, plugin.addListener, plugin.unregister]) {
      expect(fn).not.toHaveBeenCalled();
    }
    expect(api.registerPushToken).not.toHaveBeenCalled();
  });

  it("permission granted: creates the alerts channel, registers, and sends the token", async () => {
    plugin.permission = "granted";
    const push = await freshPush();
    expect(await push.requestPushPermission()).toBe("granted");
    expect(plugin.createChannel).toHaveBeenCalledWith(expect.objectContaining({ id: "ticket_alerts", importance: 4 }));
    expect(plugin.register).toHaveBeenCalledTimes(1);
    expect(api.registerPushToken).toHaveBeenCalledWith("fake-token-device-1");
  });

  it("permission denied: no registration, no token", async () => {
    plugin.permission = "denied";
    const push = await freshPush();
    expect(await push.requestPushPermission()).toBe("denied");
    expect(plugin.register).not.toHaveBeenCalled();
    expect(api.registerPushToken).not.toHaveBeenCalled();
  });

  it("a refreshed token is sent again", async () => {
    plugin.permission = "granted";
    const push = await freshPush();
    await push.requestPushPermission();
    for (const l of listeners.registration) l({ value: "fake-token-device-1-refreshed" });
    expect(api.registerPushToken).toHaveBeenLastCalledWith("fake-token-device-1-refreshed");
  });

  it("app start never asks for permission; re-registers only if already granted", async () => {
    const push = await freshPush();
    await push.startPush(() => {}, () => {});
    expect(plugin.requestPermissions).not.toHaveBeenCalled();
    expect(plugin.register).not.toHaveBeenCalled();

    plugin.permission = "granted";
    const again = await freshPush();
    await again.startPush(() => {}, () => {});
    expect(plugin.register).toHaveBeenCalledTimes(1);
  });

  it("a tapped notification opens only the listing or My Alerts", async () => {
    const navigate = vi.fn();
    const push = await freshPush();
    await push.startPush(navigate, () => {});
    const tap = (path: unknown) => listeners.pushNotificationActionPerformed[0]({ notification: { data: { path } } });
    tap("/buy/cm123abc");
    tap("/account/alerts");
    tap("https://evil.example");
    tap("/admin/dashboard");
    tap("//evil.example/x");
    tap(undefined);
    expect(navigate.mock.calls).toEqual([["/buy/cm123abc"], ["/account/alerts"]]);
  });

  it("a notification arriving with the app open refreshes the dot", async () => {
    const onMatch = vi.fn();
    const push = await freshPush();
    await push.startPush(() => {}, onMatch);
    listeners.pushNotificationReceived[0]({});
    expect(onMatch).toHaveBeenCalledTimes(1);
  });

  it("sign-out removes this device's token and unregisters", async () => {
    plugin.permission = "granted";
    const push = await freshPush();
    await push.requestPushPermission();
    await push.stopPush();
    expect(api.removePushToken).toHaveBeenCalledWith("fake-token-device-1");
    expect(plugin.unregister).toHaveBeenCalled();
    expect(store.has("gms_push_token")).toBe(false);
  });

  it("the explanation is shown only once", async () => {
    const push = await freshPush();
    expect(push.wasPushPrompted()).toBe(false);
    push.markPushPrompted();
    expect(push.wasPushPrompted()).toBe(true);
  });
});

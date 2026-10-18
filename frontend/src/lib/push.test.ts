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
// Like Capacitor's real plugin object: a Proxy that turns any property it
// doesn't know - "then" included - into a native call that never answers.
// Resolving a promise with the bare plugin therefore hangs, as on a phone.
const nativeThenCalls = vi.fn();
const pluginProxy = new Proxy(plugin, {
  get(target, prop, receiver) {
    if (prop === "then") {
      return () => {
        nativeThenCalls();
        return new Promise(() => {});
      };
    }
    return Reflect.get(target, prop, receiver);
  },
});
vi.mock("@capacitor/push-notifications", () => ({ PushNotifications: pluginProxy }));

class FakeApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
const api = {
  ApiError: FakeApiError,
  registerPushToken: vi.fn(async (): Promise<{ registered: true }> => ({ registered: true })),
  removePushToken: vi.fn(async (): Promise<{ removed: true }> => ({ removed: true })),
};
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
  ])("never loads or calls the plugin on %s", async (_label, env) => {
    Object.assign(runtime, env);
    const push = await freshPush();
    expect(push.pushSupported()).toBe(false);
    expect(await push.pushPermission()).toBe("unsupported");
    expect(await push.requestPushPermission()).toBe("unsupported");
    await push.startPush(() => {}, () => {});
    await push.stopPush();
    await push.refreshPushStatus();
    await push.retryPushRegistration();
    for (const fn of [plugin.checkPermissions, plugin.requestPermissions, plugin.register, plugin.addListener, plugin.unregister]) {
      expect(fn).not.toHaveBeenCalled();
    }
    expect(api.registerPushToken).not.toHaveBeenCalled();
  });

  it.each([
    ["the website", { native: false, platform: "web", pluginAvailable: false }],
    ["iOS", { native: true, platform: "ios", pluginAvailable: true }],
  ])("no status line on %s", async (_label, env) => {
    Object.assign(runtime, env);
    const push = await freshPush();
    expect(push.isAndroidApp()).toBe(false);
    expect(await push.refreshPushStatus()).toEqual({ state: "unsupported" });
    expect(push.pushStatusText(push.getPushStatus())).toBeNull();
  });

  it("an Android build without the plugin says so, without trying to load it", async () => {
    Object.assign(runtime, { native: true, platform: "android", pluginAvailable: false });
    const push = await freshPush();
    expect(push.isAndroidApp()).toBe(true);
    expect(push.pushDiagnostics()).toEqual({ platform: "android", plugin: "plugin not in this app build" });
    expect(await push.retryPushRegistration()).toEqual({ state: "error", reason: "plugin not in this app build" });
    expect(push.pushStatusText(push.getPushStatus())).toBe("Notifications: error – plugin not in this app build");
  });

  it("diagnostics: the platform and that the plugin is present", async () => {
    const push = await freshPush();
    expect(push.pushDiagnostics()).toEqual({ platform: "android", plugin: "plugin present" });
  });

  it("the plugin is never resolved as a thenable (Capacitor's proxy trap) - registration completes", async () => {
    // The fake really is a trap: awaiting it directly never settles.
    const settled = await Promise.race([
      Promise.resolve(pluginProxy).then(() => "settled"),
      new Promise((r) => setTimeout(() => r("hung"), 20)),
    ]);
    expect(settled).toBe("hung");
    nativeThenCalls.mockClear();

    plugin.permission = "granted";
    const push = await freshPush();
    await push.startPush(() => {}, () => {});
    await vi.waitFor(() => expect(push.getPushStatus()).toEqual({ state: "registered" }));
    await push.retryPushRegistration();
    await push.requestPushPermission();
    await push.refreshPushStatus();
    await push.stopPush();
    expect(nativeThenCalls).not.toHaveBeenCalled();
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

  describe("status line (real registration result)", () => {
    let warn: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    });
    afterEach(() => {
      warn.mockRestore();
      vi.useRealTimers();
    });
    const warned = () => warn.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");

    it("token saved on the server: on (registered), nothing logged", async () => {
      plugin.permission = "granted";
      const push = await freshPush();
      expect(push.getPushStatus()).toEqual({ state: "not-registered" });
      await push.requestPushPermission();
      await vi.waitFor(() => expect(push.getPushStatus()).toEqual({ state: "registered" }));
      expect(push.pushStatusText(push.getPushStatus())).toBe("Notifications: on (registered)");
      expect(warn).not.toHaveBeenCalled();
    });

    it("saving the device fails: error with the reason, and a console warning - never the token", async () => {
      plugin.permission = "granted";
      api.registerPushToken.mockRejectedValueOnce(new FakeApiError("boom", 500));
      const push = await freshPush();
      await push.requestPushPermission();
      await vi.waitFor(() => expect(push.getPushStatus().state).toBe("error"));
      expect(push.pushStatusText(push.getPushStatus())).toBe("Notifications: error – saving the device: server error (500)");
      expect(warned()).toContain("saving the device: server error (500)");
      expect(warned()).not.toContain("fake-token");
    });

    it.each([
      [new FakeApiError("x", 0), "can't reach the server"],
      [new FakeApiError("x", 401), "not signed in"],
      [new FakeApiError("x", 400), "server rejected the device (400)"],
    ])("describes API failures briefly (%#)", async (err, reason) => {
      const push = await freshPush();
      expect(push.describePushError(err)).toBe(reason);
    });

    it("cuts token-like strings out of any reason", async () => {
      const push = await freshPush();
      const reason = push.describePushError(new Error(`bad token ${"a1B2c3D4e5".repeat(8)} here`));
      expect(reason).toBe("bad token … here");
    });

    it("Firebase registration error: error status and a warning", async () => {
      plugin.permission = "granted";
      plugin.register.mockImplementationOnce(async () => {
        for (const l of listeners.registrationError ?? []) l({ error: "SERVICE_NOT_AVAILABLE" });
      });
      const push = await freshPush();
      await push.requestPushPermission();
      expect(push.getPushStatus()).toEqual({ state: "error", reason: "SERVICE_NOT_AVAILABLE" });
      expect(push.pushStatusText(push.getPushStatus())).toBe("Notifications: error – SERVICE_NOT_AVAILABLE");
      expect(warned()).toContain("SERVICE_NOT_AVAILABLE");
      expect(api.registerPushToken).not.toHaveBeenCalled();
    });

    it("register() throwing is an error, not swallowed", async () => {
      plugin.permission = "granted";
      plugin.register.mockRejectedValueOnce(new Error("Default FirebaseApp is not initialized"));
      const push = await freshPush();
      await push.requestPushPermission();
      expect(push.getPushStatus()).toEqual({ state: "error", reason: "register(): Default FirebaseApp is not initialized" });
      expect(warn).toHaveBeenCalled();
    });

    it("no token from Firebase in time: the timeout reason, within 15 s", async () => {
      vi.useFakeTimers();
      plugin.permission = "granted";
      plugin.register.mockImplementationOnce(async () => {});
      const push = await freshPush();
      await push.requestPushPermission();
      expect(push.pushStatusText(push.getPushStatus())).toBe("Notifications: not registered yet");
      await vi.advanceTimersByTimeAsync(push.REGISTER_TIMEOUT_MS - 1);
      expect(push.getPushStatus().state).toBe("registering");
      await vi.advanceTimersByTimeAsync(1);
      expect(push.REGISTER_TIMEOUT_MS).toBe(15_000);
      expect(push.pushStatusText(push.getPushStatus())).toBe(
        "Notifications: error – timed out getting a device token (Google Play services / Firebase config?)",
      );
      expect(warned()).toContain("timed out getting a device token");
    });

    const never = () => new Promise<never>(() => {});

    it.each([
      ["addListener", "adding the token listeners: timed out"],
      ["createChannel", "creating the notification channel: timed out"],
      ["register", "register(): timed out"],
      ["checkPermissions", "checking permission: timed out"],
    ] as const)("a native %s that never answers ends in an error, not 'Trying…' for ever", async (method, reason) => {
      vi.useFakeTimers();
      plugin.permission = "granted";
      const push = await freshPush();
      (plugin[method] as unknown as { mockImplementationOnce: (f: () => Promise<never>) => void }).mockImplementationOnce(never);
      const retry = push.retryPushRegistration();
      await vi.advanceTimersByTimeAsync(push.REGISTER_TIMEOUT_MS);
      await retry;
      expect(push.getPushStatus()).toEqual({ state: "error", reason });
      expect(warned()).toContain(reason);
    });

    it("a stuck listener isn't reused: Try again adds it afresh and can succeed", async () => {
      vi.useFakeTimers();
      plugin.permission = "granted";
      const push = await freshPush();
      plugin.addListener.mockImplementationOnce(never);
      const first = push.retryPushRegistration();
      await vi.advanceTimersByTimeAsync(push.REGISTER_TIMEOUT_MS);
      await first;
      expect(push.getPushStatus().state).toBe("error");
      await push.retryPushRegistration();
      await vi.waitFor(() => expect(push.getPushStatus()).toEqual({ state: "registered" }));
    });

    it("token received but the server never answers: error, not 'Trying…'", async () => {
      vi.useFakeTimers();
      plugin.permission = "granted";
      api.registerPushToken.mockImplementationOnce(never);
      const push = await freshPush();
      await push.requestPushPermission();
      await vi.advanceTimersByTimeAsync(push.REGISTER_TIMEOUT_MS);
      expect(push.getPushStatus()).toEqual({ state: "error", reason: "saving the device: no answer from the server" });
    });

    it("an older attempt's timer never overwrites a newer success", async () => {
      vi.useFakeTimers();
      plugin.permission = "granted";
      plugin.register.mockImplementationOnce(async () => {});
      const push = await freshPush();
      await push.requestPushPermission();
      await vi.advanceTimersByTimeAsync(push.REGISTER_TIMEOUT_MS / 2);
      await push.retryPushRegistration();
      await vi.advanceTimersByTimeAsync(0);
      expect(push.getPushStatus()).toEqual({ state: "registered" });
      await vi.advanceTimersByTimeAsync(push.REGISTER_TIMEOUT_MS);
      expect(push.getPushStatus()).toEqual({ state: "registered" });
    });

    it("app start: stuck tap listeners don't block registration", async () => {
      vi.useFakeTimers();
      plugin.permission = "granted";
      const push = await freshPush();
      plugin.addListener.mockImplementationOnce(never);
      const start = push.startPush(() => {}, () => {});
      await vi.advanceTimersByTimeAsync(push.REGISTER_TIMEOUT_MS);
      await start;
      expect(warned()).toContain("adding the notification listeners failed - timed out");
      expect(push.getPushStatus()).toEqual({ state: "registered" });
    });

    it("permission denied / not asked yet", async () => {
      plugin.permission = "denied";
      const push = await freshPush();
      await push.requestPushPermission();
      expect(push.pushStatusText(push.getPushStatus())).toBe("Notifications: permission denied");
      plugin.permission = "prompt";
      expect(await push.refreshPushStatus()).toEqual({ state: "not-registered" });
    });

    it("Try again after a failure re-registers and re-sends the token", async () => {
      plugin.permission = "granted";
      api.registerPushToken.mockRejectedValueOnce(new FakeApiError("x", 0));
      const push = await freshPush();
      await push.requestPushPermission();
      await vi.waitFor(() => expect(push.getPushStatus().state).toBe("error"));
      await push.retryPushRegistration();
      await vi.waitFor(() => expect(push.getPushStatus()).toEqual({ state: "registered" }));
      expect(plugin.register).toHaveBeenCalledTimes(2);
      expect(api.registerPushToken).toHaveBeenCalledTimes(2);
    });

    it("Try again while permission can still be asked shows Android's prompt", async () => {
      const push = await freshPush();
      plugin.requestPermissions.mockImplementationOnce(async () => ({ receive: "granted" }));
      await push.retryPushRegistration();
      expect(plugin.requestPermissions).toHaveBeenCalledTimes(1);
      await vi.waitFor(() => expect(push.getPushStatus()).toEqual({ state: "registered" }));
    });

    it("Try again when denied never prompts; stays denied", async () => {
      plugin.permission = "denied";
      const push = await freshPush();
      expect(await push.retryPushRegistration()).toEqual({ state: "denied" });
      expect(plugin.requestPermissions).not.toHaveBeenCalled();
    });

    it("subscribers hear every change; sign-out resets to not registered and warns on failure", async () => {
      plugin.permission = "granted";
      const push = await freshPush();
      const seen: string[] = [];
      push.subscribePushStatus((s) => seen.push(s.state));
      await push.requestPushPermission();
      await vi.waitFor(() => expect(seen).toContain("registered"));
      api.removePushToken.mockRejectedValueOnce(new FakeApiError("x", 0));
      await push.stopPush();
      expect(push.getPushStatus()).toEqual({ state: "not-registered" });
      expect(warned()).toContain("removing the device failed - can't reach the server");
      expect(seen).toEqual(["registering", "registered", "not-registered"]);
    });
  });

  it("the explanation is shown only once", async () => {
    const push = await freshPush();
    expect(push.wasPushPrompted()).toBe(false);
    push.markPushPrompted();
    expect(push.wasPushPrompted()).toBe(true);
  });
});

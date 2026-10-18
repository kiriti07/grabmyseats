import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// firebase-admin's messaging is replaced, so nothing here ever reaches FCM.
const sendEach = vi.fn();
vi.mock("firebase-admin/messaging", () => ({ getMessaging: () => ({ sendEach }) }));

import { checkPushConfigAtStartup, getPushSender, setPushSender } from "./index";
import { loadServiceAccount, PushConfigError } from "./config";
import { FcmPushSender, sanitizeFcmMessage } from "./FcmPushSender";

// A throwaway key generated here - a stand-in with the right shape, not a
// real service account.
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const FAKE_ACCOUNT = {
  type: "service_account",
  project_id: "test-project",
  client_email: "fcm-sender@test-project.iam.gserviceaccount.com",
  private_key: privateKey,
};
const b64 = (value: unknown) => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64");

describe("push settings", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "push-config-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    setPushSender(undefined);
  });

  function env(vars: Record<string, string>) {
    vi.stubEnv("PUSH_NOTIFICATIONS_ENABLED", "");
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_BASE64", "");
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_FILE", "");
    for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
  }

  it("is off unless PUSH_NOTIFICATIONS_ENABLED=true", () => {
    env({ FIREBASE_SERVICE_ACCOUNT_BASE64: b64(FAKE_ACCOUNT) });
    expect(checkPushConfigAtStartup()).toBe("disabled");
    expect(getPushSender()).toBeNull();
  });

  it("reads the key from base64 or from a file", () => {
    env({ FIREBASE_SERVICE_ACCOUNT_BASE64: b64(FAKE_ACCOUNT) });
    expect(loadServiceAccount()).toMatchObject({ projectId: "test-project" });

    const file = path.join(dir, "key.json");
    writeFileSync(file, JSON.stringify(FAKE_ACCOUNT));
    env({ FIREBASE_SERVICE_ACCOUNT_FILE: file });
    expect(loadServiceAccount()).toMatchObject({ clientEmail: FAKE_ACCOUNT.client_email });
  });

  it.each([
    [{}, "must be set"],
    [{ FIREBASE_SERVICE_ACCOUNT_BASE64: "x", FIREBASE_SERVICE_ACCOUNT_FILE: "/x" }, "only one"],
    [{ FIREBASE_SERVICE_ACCOUNT_BASE64: b64("not json SECRET-MARKER") }, "not a valid service-account JSON"],
    [{ FIREBASE_SERVICE_ACCOUNT_BASE64: b64({ ...FAKE_ACCOUNT, type: "user" }) }, "not a valid service-account JSON"],
    [{ FIREBASE_SERVICE_ACCOUNT_FILE: "/nonexistent/key.json" }, "can't be read"],
  ])("refuses a bad key without printing it (%o)", (vars, message) => {
    env(vars as Record<string, string>);
    let error: unknown;
    try {
      loadServiceAccount();
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(PushConfigError);
    expect((error as Error).message).toContain(message);
    expect((error as Error).message).not.toContain("SECRET-MARKER");
    for (const value of Object.values(vars as Record<string, string>)) {
      if (value.length > 3) expect((error as Error).message).not.toContain(value);
    }
  });

  it("outside production, switched on without a key just stays off", () => {
    env({ PUSH_NOTIFICATIONS_ENABLED: "true" });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(checkPushConfigAtStartup()).toBe("disabled");
    expect(getPushSender()).toBeNull();
  });

  it("in production, switched on without a valid key refuses to start", () => {
    env({ PUSH_NOTIFICATIONS_ENABLED: "true", NODE_ENV: "production" });
    expect(() => checkPushConfigAtStartup()).toThrow(/PUSH_NOTIFICATIONS_ENABLED=true but/);
    env({ PUSH_NOTIFICATIONS_ENABLED: "true", NODE_ENV: "production", FIREBASE_SERVICE_ACCOUNT_BASE64: b64(FAKE_ACCOUNT) });
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(checkPushConfigAtStartup()).toBe("enabled");
  });

  it("enabled: logs the key's project id - and nothing else from the key", () => {
    env({ PUSH_NOTIFICATIONS_ENABLED: "true", FIREBASE_SERVICE_ACCOUNT_BASE64: b64(FAKE_ACCOUNT) });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(checkPushConfigAtStartup()).toBe("enabled");
    const out = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(out).toBe("[config] PUSH project=test-project");
    expect(out).not.toContain(FAKE_ACCOUNT.client_email);
    expect(out).not.toContain("PRIVATE KEY");
  });

  it("disabled: no project line", () => {
    env({});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(checkPushConfigAtStartup()).toBe("disabled");
    expect(log).not.toHaveBeenCalled();
  });

  it("the server itself refuses to boot in production with push on and a bad key - without printing the key", () => {
    const secret = b64("not json SECRET-MARKER");
    const run = spawnSync(process.execPath, ["-r", "ts-node/register/transpile-only", "-e", "require('./src/index')"], {
      cwd: path.resolve(__dirname, "../../.."),
      env: {
        ...process.env,
        NODE_ENV: "production",
        DEV_OTP_BYPASS_CODE: "",
        PUSH_NOTIFICATIONS_ENABLED: "true",
        FIREBASE_SERVICE_ACCOUNT_BASE64: secret,
        FIREBASE_SERVICE_ACCOUNT_FILE: "",
        PORT: "0",
      },
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("PUSH_NOTIFICATIONS_ENABLED=true but FIREBASE_SERVICE_ACCOUNT_BASE64 is not a valid service-account JSON");
    expect(run.stderr + run.stdout).not.toContain(secret);
    expect(run.stderr + run.stdout).not.toContain("SECRET-MARKER");
  });
});

describe("FCM sender", () => {
  const sender = new FcmPushSender({
    projectId: FAKE_ACCOUNT.project_id,
    clientEmail: FAKE_ACCOUNT.client_email,
    privateKey: FAKE_ACCOUNT.private_key,
  });
  const message = { title: "Tickets available", body: "Jailer, 20 Oct - 4 seats near you", path: "/buy/abc" };
  let errorLog: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    sendEach.mockReset();
    errorLog.mockRestore();
  });
  const logged = () => errorLog.mock.calls.map((c) => String(c[0]));
  // Shaped like a real FCM token - must never appear in a log line.
  const TOKEN = "dQw4w9WgXcQ:APA91bH" + "x".repeat(140);

  it("sends one Android message per device with the alerts channel, tag and tap path", async () => {
    sendEach.mockResolvedValue({ responses: [{ success: true }, { success: true }] });
    await sender.send(["t1", "t2"], message);
    const [messages] = sendEach.mock.calls[0];
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({
      token: "t1",
      notification: { title: message.title, body: message.body },
      data: { path: "/buy/abc" },
      android: { priority: "high", notification: { channelId: "ticket_alerts", tag: "ticket-alerts", icon: "ic_stat_notification" } },
    });
  });

  it("maps FCM's answers per device", async () => {
    const fail = (code: string) => ({ success: false, error: { code } });
    sendEach.mockResolvedValue({
      responses: [
        { success: true },
        fail("messaging/registration-token-not-registered"),
        fail("messaging/invalid-registration-token"),
        fail("messaging/server-unavailable"),
        fail("messaging/invalid-argument"),
      ],
    });
    const result = await sender.send(["a", "b", "c", "d", "e"], message);
    expect(result.map((r) => r.outcome)).toEqual(["sent", "invalid-token", "invalid-token", "retryable", "rejected"]);
  });

  it("no answer at all is 'unknown' - never retried", async () => {
    sendEach.mockRejectedValue(new Error("socket hang up"));
    const result = await sender.send(["a", "b"], message);
    expect(result.map((r) => r.outcome)).toEqual(["unknown", "unknown"]);
  });

  it("a failed send logs one line per code: code, status, device count, cleaned message - never the token", async () => {
    sendEach.mockResolvedValue({
      responses: [
        { success: true },
        { success: false, error: { code: "messaging/mismatched-credential", message: "SenderId mismatch" } },
        { success: false, error: { code: "messaging/mismatched-credential", message: "SenderId mismatch" } },
      ],
    });
    await sender.send(["ok", TOKEN, TOKEN], message);
    expect(logged()).toEqual(["[push] send failed: code=messaging/mismatched-credential, status=n/a, devices=2 - SenderId mismatch"]);
    expect(logged().join()).not.toContain("dQw4w9WgXcQ");
    expect(logged().join()).not.toContain(message.body);
  });

  it("takes the HTTP status from a non-JSON answer's message", async () => {
    sendEach.mockResolvedValue({
      responses: [{
        success: false,
        error: { code: "messaging/authentication-error", message: 'Auth error. Raw server response: "<html>denied</html>". Status code: 403.' },
      }],
    });
    await sender.send([TOKEN], message);
    expect(logged()[0]).toMatch(/^\[push\] send failed: code=messaging\/authentication-error, status=403, devices=1 - /);
  });

  it("no answer at all is logged too, as not retried", async () => {
    sendEach.mockRejectedValue(Object.assign(new Error("Credential implementation provided failed to fetch a valid access token"), { code: "app/invalid-credential" }));
    await sender.send([TOKEN, TOKEN], message);
    expect(logged()).toEqual([
      "[push] send failed: code=app/invalid-credential, status=n/a, devices=2 (no per-device answer, not retried) - Credential implementation provided failed to fetch a valid access token",
    ]);
  });

  it("successful sends log nothing", async () => {
    sendEach.mockResolvedValue({ responses: [{ success: true }] });
    await sender.send([TOKEN], message);
    expect(errorLog).not.toHaveBeenCalled();
  });

  it("cleans FCM messages of keys, tokens, emails and long numbers", () => {
    expect(sanitizeFcmMessage(`bad ${TOKEN} for fcm-sender@p.iam.gserviceaccount.com +91 98765 43210 -----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----`))
      .toBe("bad <redacted> for <email> <number> <key>");
    expect(sanitizeFcmMessage("x".repeat(30).split("").join(" ").repeat(10)).length).toBeLessThanOrEqual(160);
    expect(sanitizeFcmMessage(undefined)).toBe("");
  });
});

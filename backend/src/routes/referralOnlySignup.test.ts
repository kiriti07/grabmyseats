import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { issueOtp } from "../lib/otpStore";
import { loginOtpIdentifier } from "../lib/identity";
import { emailProvider } from "../lib/email";
import { smsProvider } from "../lib/sms";
import { checkDevOtpBypassAtStartup } from "../lib/config";
import { normalizeReferralCode, resolveReferrer } from "../lib/referral";

// Invite-only sign-up (REQUIRE_REFERRAL_FOR_SIGNUP): with the flag on, a
// new account can only be created with a valid invite (referral) code, on
// every path that creates one - POST /api/auth/otp/verify (intent signup)
// and the signin -> POST /api/auth/signup/confirm detour - while existing
// accounts log in exactly as before. Called straight through supertest, so
// every case here is also "a direct API call that skips the frontend".
// The Play reviewer exemption lives in reviewLogin.test.ts (it owns the one
// review account). Real local Postgres + Redis; email/SMS only spied on.
describe("invite-only sign-up", () => {
  const userIds: string[] = [];

  function randomEmail(): string {
    return `invite-${randomUUID()}@example.com`;
  }

  function randomPhone(): string {
    return `+91${Math.floor(6_000_000_000 + Math.random() * 3_999_999_999)}`;
  }

  // Each test gets its own client IP for the per-IP limiters - see
  // otpAuth.test.ts for why (parallel suites share Redis and loopback).
  let clientIp = "";
  function randomClientIp(): string {
    const octet = () => Math.floor(Math.random() * 254) + 1;
    return `10.${octet()}.${octet()}.${octet()}`;
  }

  async function createUser(
    data: { suspended?: boolean; deleted?: boolean; referralCode?: string } = {},
  ) {
    const user = await prisma.user.create({
      data: {
        email: randomEmail(),
        emailVerifiedAt: new Date(),
        ...(data.referralCode ? { referralCode: data.referralCode } : {}),
        ...(data.suspended ? { suspendedAt: new Date(), suspensionReason: "test" } : {}),
        ...(data.deleted ? { deletedAt: new Date() } : {}),
      },
    });
    userIds.push(user.id);
    return user;
  }

  function verify(body: Record<string, unknown>) {
    return request(app).post("/api/auth/otp/verify").set("X-Forwarded-For", clientIp).send(body);
  }

  async function verifyWithCode(
    identifier: string,
    extra: Record<string, unknown> = {},
    channel: "email" | "phone" = "email",
  ) {
    const code = await issueOtp(loginOtpIdentifier(channel, identifier));
    const res = await verify({ channel, identifier, code, ...extra });
    if (res.body?.data?.user?.id) userIds.push(res.body.data.user.id);
    return res;
  }

  function confirm(body: Record<string, unknown>) {
    return request(app)
      .post("/api/auth/signup/confirm")
      .set("X-Forwarded-For", clientIp)
      .send(body);
  }

  function requestCode(body: Record<string, unknown>) {
    return request(app).post("/api/auth/otp/request").set("X-Forwarded-For", clientIp).send(body);
  }

  async function pendingCodeExists(email: string): Promise<boolean> {
    return (await redis.exists(`otp:${loginOtpIdentifier("email", email)}`)) === 1;
  }

  async function referrerOf(userId: string): Promise<string | null> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return user.referredByUserId;
  }

  let emailSpy: MockInstance<(to: string, subject: string, body: string) => Promise<void>>;
  let smsSpy: MockInstance<(phone: string, message: string) => Promise<void>>;

  beforeEach(async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("REQUIRE_REFERRAL_FOR_SIGNUP", "true");
    vi.stubEnv("DEV_OTP_BYPASS_CODE", "");
    clientIp = randomClientIp();
    const keys = await redis.keys("rl:otp-global:*");
    if (keys.length > 0) await redis.del(...keys);
    emailSpy = vi.spyOn(emailProvider, "send").mockResolvedValue(undefined);
    smsSpy = vi.spyOn(smsProvider, "send").mockResolvedValue(undefined);
  });

  afterEach(() => {
    emailSpy.mockRestore();
    smsSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    // referredByUserId is ON DELETE SET NULL - order doesn't matter.
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  describe("a new identifier without a valid code is refused at the API", () => {
    it("otp/verify (intent signup) with no code: 403, no account", async () => {
      const email = randomEmail();
      const res = await verifyWithCode(email, { intent: "signup" });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/invite-only/);
      expect(await prisma.user.count({ where: { email } })).toBe(0);
    });

    it("otp/verify with intent omitted (the old default) is refused too", async () => {
      const email = randomEmail();
      const res = await verifyWithCode(email);
      expect(res.status).toBe(403);
      expect(await prisma.user.count({ where: { email } })).toBe(0);
    });

    it("a phone sign-up with no code is refused", async () => {
      const phone = randomPhone();
      const res = await verifyWithCode(phone, { intent: "signup" }, "phone");
      expect(res.status).toBe(403);
      expect(await prisma.user.count({ where: { phone } })).toBe(0);
    });

    it("the DEV_OTP_BYPASS_CODE path doesn't skip the invite check", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("DEV_OTP_BYPASS_CODE", "731904");
      const email = randomEmail();
      const res = await verify({ channel: "email", identifier: email, code: "731904", intent: "signup" });
      expect(res.status).toBe(403);
      expect(await prisma.user.count({ where: { email } })).toBe(0);
    });

    for (const [label, ref] of [
      ["made-up", "ZZZZZZZ"],
      ["edited (one character changed)", null],
      ["malformed", "<script>"],
      ["absurdly long", "A".repeat(500)],
      ["non-string", { $ne: null }],
    ] as const) {
      it(`${label} code: 403 "isn't valid anymore", no account`, async () => {
        const referrer = await createUser();
        const edited =
          ref ??
          referrer.referralCode.slice(0, -1) + (referrer.referralCode.endsWith("Z") ? "Y" : "Z");
        const email = randomEmail();
        const res = await verifyWithCode(email, { intent: "signup", ref: edited });
        expect(res.status).toBe(403);
        // A non-string is treated as no code at all.
        expect(res.body.error).toMatch(typeof edited === "string" ? /isn't valid anymore/ : /invite-only/);
        expect(await prisma.user.count({ where: { email } })).toBe(0);
      });
    }
  });

  describe("a valid code creates an account linked to the referrer", () => {
    it("exact code", async () => {
      const referrer = await createUser();
      const res = await verifyWithCode(randomEmail(), {
        intent: "signup",
        ref: referrer.referralCode,
      });
      expect(res.status).toBe(200);
      expect(res.body.data.isNewAccount).toBe(true);
      expect(await referrerOf(res.body.data.user.id)).toBe(referrer.id);
    });

    it("lowercase, padded and dash-grouped codes match the same referrer", async () => {
      const referrer = await createUser();
      const code = referrer.referralCode;
      for (const typed of [
        code.toLowerCase(),
        `  ${code}  `,
        `${code.slice(0, 3)}-${code.slice(3)}`,
        `${code.slice(0, 3)} ${code.slice(3).toLowerCase()}`,
      ]) {
        const res = await verifyWithCode(randomEmail(), { intent: "signup", ref: typed });
        expect(res.status).toBe(200);
        expect(await referrerOf(res.body.data.user.id)).toBe(referrer.id);
      }
    });

    it("an older hex code typed with O for 0 and I/l for 1 still matches", async () => {
      const hex = `A0B1${randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase()}`;
      const referrer = await createUser({ referralCode: hex });
      const typed = `aobl${hex.slice(4).toLowerCase()}`;
      const res = await verifyWithCode(randomEmail(), { intent: "signup", ref: typed });
      expect(res.status).toBe(200);
      expect(await referrerOf(res.body.data.user.id)).toBe(referrer.id);
    });

    it("a phone sign-up with a valid code", async () => {
      const referrer = await createUser();
      const res = await verifyWithCode(
        randomPhone(),
        { intent: "signup", ref: referrer.referralCode },
        "phone",
      );
      expect(res.status).toBe(200);
      expect(await referrerOf(res.body.data.user.id)).toBe(referrer.id);
    });
  });

  describe("suspended and deleted referrers' codes are refused", () => {
    for (const kind of ["suspended", "deleted"] as const) {
      it(`${kind} referrer: 403, no account, and the code checks as invalid`, async () => {
        const referrer = await createUser({ [kind]: true });
        const email = randomEmail();
        const res = await verifyWithCode(email, { intent: "signup", ref: referrer.referralCode });
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/isn't valid anymore/);
        expect(await prisma.user.count({ where: { email } })).toBe(0);

        const check = await request(app)
          .post("/api/auth/referral/check")
          .set("X-Forwarded-For", clientIp)
          .send({ code: referrer.referralCode });
        expect(check.status).toBe(200);
        expect(check.body.data).toEqual({ valid: false });
      });
    }
  });

  describe("existing accounts are unaffected", () => {
    it("log in without any code, through both intents", async () => {
      const existing = await createUser();
      for (const intent of ["signin", "signup"] as const) {
        const res = await verifyWithCode(existing.email!, { intent });
        expect(res.status).toBe(200);
        expect(res.body.data.isNewAccount).toBe(false);
        expect(res.body.data.user.id).toBe(existing.id);
      }
    });

    it("get a sign-in code without any code", async () => {
      const existing = await createUser();
      const res = await requestCode({ channel: "email", identifier: existing.email });
      expect(res.status).toBe(200);
      expect(await pendingCodeExists(existing.email!)).toBe(true);
    });

    it("can't switch referrer by logging in through someone else's link", async () => {
      const first = await createUser();
      const second = await createUser();
      const email = randomEmail();
      const signup = await verifyWithCode(email, { intent: "signup", ref: first.referralCode });
      expect(signup.status).toBe(200);
      const id = signup.body.data.user.id;

      for (const intent of ["signin", "signup"] as const) {
        const again = await verifyWithCode(email, { intent, ref: second.referralCode });
        expect(again.status).toBe(200);
        expect(again.body.data.user.id).toBe(id);
        expect(again.body.data.isNewAccount).toBe(false);
      }
      expect(await referrerOf(id)).toBe(first.id);
    });

    it("a user without a referrer doesn't gain one by logging in with a code", async () => {
      const existing = await createUser();
      const referrer = await createUser();
      const res = await verifyWithCode(existing.email!, {
        intent: "signup",
        ref: referrer.referralCode,
      });
      expect(res.status).toBe(200);
      expect(await referrerOf(existing.id)).toBeNull();
    });
  });

  describe("signin -> signup/confirm checks the code again itself", () => {
    async function signinToken(email: string): Promise<string> {
      const res = await verifyWithCode(email, { intent: "signin" });
      expect(res.status).toBe(200);
      expect(res.body.data.noAccount).toBe(true);
      return res.body.data.signupToken as string;
    }

    it("no code: 403; the token survives, so a valid code then works", async () => {
      const referrer = await createUser();
      const email = randomEmail();
      const signupToken = await signinToken(email);

      const refused = await confirm({ signupToken });
      expect(refused.status).toBe(403);
      expect(refused.body.error).toMatch(/invite-only/);
      expect(await prisma.user.count({ where: { email } })).toBe(0);

      const ok = await confirm({ signupToken, ref: referrer.referralCode.toLowerCase() });
      expect(ok.status).toBe(200);
      userIds.push(ok.body.data.user.id);
      expect(ok.body.data.isNewAccount).toBe(true);
      expect(await referrerOf(ok.body.data.user.id)).toBe(referrer.id);

      // Spent now.
      const reuse = await confirm({ signupToken, ref: referrer.referralCode });
      expect(reuse.status).toBe(401);
    });

    it("a bad, suspended or deleted referrer's code: 403, no account", async () => {
      const suspended = await createUser({ suspended: true });
      const deleted = await createUser({ deleted: true });
      const email = randomEmail();
      const signupToken = await signinToken(email);
      for (const ref of ["ZZZZZZZ", suspended.referralCode, deleted.referralCode]) {
        const res = await confirm({ signupToken, ref });
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/isn't valid anymore/);
      }
      expect(await prisma.user.count({ where: { email } })).toBe(0);
    });

    it("a made-up token is refused whatever the code", async () => {
      const referrer = await createUser();
      const res = await confirm({ signupToken: randomUUID(), ref: referrer.referralCode });
      expect(res.status).toBe(401);
    });

    it("is rate-limited per IP", async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        statuses.push((await confirm({ signupToken: randomUUID(), ref: "ZZZZZZZ" })).status);
      }
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses[10]).toBe(429);
    });
  });

  describe("no code is sent to a new identifier without a valid invite code", () => {
    it("same reply either way, but only the invited one gets a code", async () => {
      const referrer = await createUser();
      const uninvited = randomEmail();
      const badCode = randomEmail();
      const invited = randomEmail();

      const a = await requestCode({ channel: "email", identifier: uninvited });
      const b = await requestCode({ channel: "email", identifier: badCode, ref: "ZZZZZZZ" });
      const c = await requestCode({
        channel: "email",
        identifier: invited,
        ref: referrer.referralCode,
      });
      expect(a.status).toBe(200);
      expect(b.body).toEqual(a.body);
      expect(c.body).toEqual(a.body);

      expect(await pendingCodeExists(uninvited)).toBe(false);
      expect(await pendingCodeExists(badCode)).toBe(false);
      expect(await pendingCodeExists(invited)).toBe(true);
      await vi.waitFor(() => expect(emailSpy).toHaveBeenCalledTimes(1));
      expect(emailSpy.mock.calls[0][0]).toBe(invited);
    });

    it("a suspended referrer's code doesn't get a code sent either", async () => {
      const referrer = await createUser({ suspended: true });
      const email = randomEmail();
      await requestCode({ channel: "email", identifier: email, ref: referrer.referralCode });
      expect(await pendingCodeExists(email)).toBe(false);
    });
  });

  describe("POST /api/auth/referral/check", () => {
    it("answers valid or not, never whose code it is", async () => {
      const referrer = await createUser();
      const check = (code: unknown) =>
        request(app).post("/api/auth/referral/check").set("X-Forwarded-For", clientIp).send({ code });

      const ok = await check(` ${referrer.referralCode.toLowerCase()} `);
      expect(ok.status).toBe(200);
      expect(ok.body.data).toEqual({ valid: true });
      expect((await check("ZZZZZZZ")).body.data).toEqual({ valid: false });
      expect((await check("")).body.data).toEqual({ valid: false });
      expect((await check(undefined)).body.data).toEqual({ valid: false });
    });

    it("is rate-limited per IP against guessing", async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 21; i++) {
        const res = await request(app)
          .post("/api/auth/referral/check")
          .set("X-Forwarded-For", clientIp)
          .send({ code: `GUESS${i}` });
        statuses.push(res.status);
      }
      expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
      expect(statuses[20]).toBe(429);
    });
  });

  describe("with REQUIRE_REFERRAL_FOR_SIGNUP off (the default)", () => {
    beforeEach(() => {
      vi.stubEnv("REQUIRE_REFERRAL_FOR_SIGNUP", "");
    });

    it("a new account is created without a code, as before", async () => {
      const email = randomEmail();
      const res = await verifyWithCode(email, { intent: "signup" });
      expect(res.status).toBe(200);
      expect(res.body.data.isNewAccount).toBe(true);
      expect(await referrerOf(res.body.data.user.id)).toBeNull();
    });

    it("a bad or suspended referrer's code is ignored - account created, nobody credited", async () => {
      const suspended = await createUser({ suspended: true });
      for (const ref of ["ZZZZZZZ", suspended.referralCode]) {
        const res = await verifyWithCode(randomEmail(), { intent: "signup", ref });
        expect(res.status).toBe(200);
        expect(await referrerOf(res.body.data.user.id)).toBeNull();
      }
    });

    it("a code is sent to a new identifier with no invite code", async () => {
      const email = randomEmail();
      const res = await requestCode({ channel: "email", identifier: email });
      expect(res.status).toBe(200);
      expect(await pendingCodeExists(email)).toBe(true);
    });
  });

  describe("DEV_OTP_BYPASS_CODE can never work in production", () => {
    it("startup refuses to boot with it set under NODE_ENV=production", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("DEV_OTP_BYPASS_CODE", "731904");
      expect(() => checkDevOtpBypassAtStartup()).toThrow(/DEV_OTP_BYPASS_CODE/);

      vi.stubEnv("DEV_OTP_BYPASS_CODE", "");
      expect(() => checkDevOtpBypassAtStartup()).not.toThrow();
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("DEV_OTP_BYPASS_CODE", "731904");
      expect(() => checkDevOtpBypassAtStartup()).not.toThrow();
    });

    it("and the code itself is just a wrong code at request time in production", async () => {
      const existing = await createUser();
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("DEV_OTP_BYPASS_CODE", "731904");
      const res = await verify({
        channel: "email",
        identifier: existing.email,
        code: "731904",
        intent: "signin",
      });
      expect(res.status).toBe(401);
    });
  });

  describe("code matching helpers", () => {
    it("normalizeReferralCode trims, drops spaces/dashes and uppercases", () => {
      expect(normalizeReferralCode("  abc-d ef7 ")).toBe("ABCDEF7");
      expect(normalizeReferralCode(42)).toBe("");

    });

    it("resolveReferrer: missing vs invalid vs valid", async () => {
      const referrer = await createUser();
      expect(await resolveReferrer(undefined)).toEqual({ status: "missing" });
      expect(await resolveReferrer("   ")).toEqual({ status: "missing" });
      expect(await resolveReferrer("A!")).toEqual({ status: "invalid" });
      expect(await resolveReferrer("A".repeat(65))).toEqual({ status: "invalid" });
      expect(await resolveReferrer(referrer.referralCode.toLowerCase())).toEqual({
        status: "valid",
        referrerId: referrer.id,
      });
    });
  });
});

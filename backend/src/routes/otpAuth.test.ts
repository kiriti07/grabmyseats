import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
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
import { issueSessionToken } from "../lib/session";
import { issueOtp } from "../lib/otpStore";
import { claimOtpIdentifier, loginOtpIdentifier } from "../lib/identity";
import { emailProvider } from "../lib/email";
import { smsProvider } from "../lib/sms";

// End-to-end coverage for the shared email-or-phone OTP backend (POST
// /api/auth/otp/request, /otp/verify with intent signin|signup,
// /signup/confirm, GET /options) and phone as a verified login identity
// (lib/identity.ts), against the real local Postgres + Redis through the
// actual Express app. Email/SMS providers are only spied on. Email-specific
// behaviour (+tag aliasing, header injection, the add-email flow) lives in
// emailLogin.test.ts; referral attribution in referrals.test.ts.
describe("OTP sign-in / sign-up (email or phone)", () => {
  const userIds: string[] = [];

  function randomEmail(): string {
    return `otp-${randomUUID()}@example.com`;
  }

  // +91 - inside the default SMS_ALLOWED_COUNTRY_CODES.
  function randomPhone(): string {
    return `+91${Math.floor(6_000_000_000 + Math.random() * 3_999_999_999)}`;
  }

  async function createUser(data: {
    email?: string;
    emailVerified?: boolean;
    phone?: string | null;
    phoneVerified?: boolean;
  }) {
    const user = await prisma.user.create({
      data: {
        email: data.email ?? null,
        emailVerifiedAt: data.emailVerified ? new Date() : null,
        phone: data.phone ?? null,
        phoneVerifiedAt: data.phoneVerified ? new Date() : null,
        hasWhatsapp: !!data.phone,
      },
    });
    userIds.push(user.id);
    return { user, token: await issueSessionToken(user) };
  }

  async function verify(
    channel: "email" | "phone",
    identifier: string,
    intent: "signin" | "signup",
  ) {
    const code = await issueOtp(loginOtpIdentifier(channel, identifier));
    const res = await request(app)
      .post("/api/auth/otp/verify")
      .send({ channel, identifier, code, intent });
    if (res.body?.data?.user?.id) userIds.push(res.body.data.user.id);
    return res;
  }

  // Each test gets its own client IP for the per-IP OTP limit (otpIpLimiter):
  // other suites hit the same endpoints in parallel from the same loopback
  // address, and the counters live in Redis. trust proxy "loopback" is
  // test-only here - it lets supertest's X-Forwarded-For set req.ip.
  let clientIp = "";
  function randomClientIp(): string {
    const octet = () => Math.floor(Math.random() * 254) + 1;
    return `10.${octet()}.${octet()}.${octet()}`;
  }

  async function resetSharedRateLimits() {
    const keys = await redis.keys("rl:otp-global:*");
    if (keys.length > 0) await redis.del(...keys);
  }

  let emailSpy: MockInstance<(to: string, subject: string, body: string) => Promise<void>>;
  let smsSpy: MockInstance<(phone: string, message: string) => Promise<void>>;

  beforeAll(() => {
    app.set("trust proxy", "loopback");
  });

  beforeEach(async () => {
    clientIp = randomClientIp();
    await resetSharedRateLimits();
    emailSpy = vi.spyOn(emailProvider, "send").mockResolvedValue(undefined);
    smsSpy = vi.spyOn(smsProvider, "send").mockResolvedValue(undefined);
  });

  afterEach(() => {
    emailSpy.mockRestore();
    smsSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  describe("no account enumeration", () => {
    for (const channel of ["email", "phone"] as const) {
      it(`/otp/request answers identically for an existing and a new ${channel}`, async () => {
        const existing = channel === "email" ? randomEmail() : randomPhone();
        await createUser(
          channel === "email"
            ? { email: existing, emailVerified: true }
            : { phone: existing, phoneVerified: true },
        );
        const fresh = channel === "email" ? randomEmail() : randomPhone();

        const send = (identifier: string) =>
          request(app)
            .post("/api/auth/otp/request")
            .set("X-Forwarded-For", clientIp)
            .send({ channel, identifier });
        const a = await send(existing);
        const b = await send(fresh);
        expect(a.status).toBe(200);
        expect(b.status).toBe(a.status);
        expect(b.body).toEqual(a.body);
      });

      it(`a wrong ${channel} code gets the identical 401 whether or not an account exists`, async () => {
        const existing = channel === "email" ? randomEmail() : randomPhone();
        await createUser(
          channel === "email"
            ? { email: existing, emailVerified: true }
            : { phone: existing, phoneVerified: true },
        );
        const fresh = channel === "email" ? randomEmail() : randomPhone();

        const send = (identifier: string) =>
          request(app)
            .post("/api/auth/otp/verify")
            .send({ channel, identifier, code: "482915", intent: "signin" });
        const a = await send(existing);
        const b = await send(fresh);
        expect(a.status).toBe(401);
        expect(b.status).toBe(401);
        expect(b.body).toEqual(a.body);
      });
    }
  });

  describe("phone codes", () => {
    it("are sent by SMS through the SmsProvider, as fixed text with the code", async () => {
      const phone = randomPhone();
      const res = await request(app)
        .post("/api/auth/otp/request")
        .set("X-Forwarded-For", clientIp)
        .send({ channel: "phone", identifier: phone, ref: "Visit http://evil.example" });
      expect(res.status).toBe(200);

      await vi.waitFor(() => expect(smsSpy).toHaveBeenCalledTimes(1));
      const [to, message] = smsSpy.mock.calls[0];
      expect(to).toBe(phone);
      expect(message).toMatch(/^Your GrabMySeats code is \d{6}$/);
      expect(emailSpy).not.toHaveBeenCalled();
    });

    it("accept common formatting but store/send E.164", async () => {
      const phone = randomPhone();
      const formatted = `${phone.slice(0, 3)} ${phone.slice(3, 8)}-${phone.slice(8)}`;
      const res = await request(app)
        .post("/api/auth/otp/request")
        .set("X-Forwarded-For", clientIp)
        .send({ channel: "phone", identifier: formatted });
      expect(res.status).toBe(200);
      await vi.waitFor(() => expect(smsSpy).toHaveBeenCalledTimes(1));
      expect(smsSpy.mock.calls[0][0]).toBe(phone);
    });

    it("are refused outside SMS_ALLOWED_COUNTRY_CODES (SMS-pumping guard)", async () => {
      // Fresh each run - per-number limits persist in Redis between runs.
      const usPhone = `+1202555${String(Math.floor(Math.random() * 10_000)).padStart(4, "0")}`;
      const res = await request(app)
        .post("/api/auth/otp/request")
        .set("X-Forwarded-For", clientIp)
        .send({ channel: "phone", identifier: usPhone });
      expect(res.status).toBe(400);
      expect(smsSpy).not.toHaveBeenCalled();

      vi.stubEnv("SMS_ALLOWED_COUNTRY_CODES", "91,1");
      const allowed = await request(app)
        .post("/api/auth/otp/request")
        .set("X-Forwarded-For", clientIp)
        .send({ channel: "phone", identifier: usPhone });
      expect(allowed.status).toBe(200);
    });

    it("are unavailable in production while SMS is console-only", async () => {
      vi.stubEnv("NODE_ENV", "production");
      const options = await request(app).get("/api/auth/options");
      expect(options.body.data.phoneOtpAvailable).toBe(false);

      const res = await request(app)
        .post("/api/auth/otp/request")
        .set("X-Forwarded-For", clientIp)
        .send({ channel: "phone", identifier: randomPhone() });
      expect(res.status).toBe(400);
      expect(smsSpy).not.toHaveBeenCalled();
    });

    it("400 on a malformed number", async () => {
      const res = await request(app)
        .post("/api/auth/otp/request")
        .set("X-Forwarded-For", clientIp)
        .send({ channel: "phone", identifier: "9876543210" });
      expect(res.status).toBe(400);
    });
  });

  describe("sign-in vs sign-up", () => {
    it("sign-in for an unknown identifier creates nothing until 'create an account?' is confirmed", async () => {
      const phone = randomPhone();
      const res = await verify("phone", phone, "signin");
      expect(res.status).toBe(200);
      expect(res.body.data.noAccount).toBe(true);
      expect(res.body.data.token).toBeUndefined();
      expect(await prisma.user.count({ where: { phone } })).toBe(0);

      const confirm = await request(app)
        .post("/api/auth/signup/confirm")
        .send({ signupToken: res.body.data.signupToken });
      expect(confirm.status).toBe(200);
      expect(confirm.body.data.isNewAccount).toBe(true);
      expect(confirm.body.data.user.phone).toBe(phone);
      expect(confirm.body.data.user.isPhoneVerified).toBe(true);
      expect(confirm.body.data.user.isVerified).toBe(false);
      userIds.push(confirm.body.data.user.id);
    });

    it("sign-up for a new phone creates a phone-verified account", async () => {
      const res = await verify("phone", randomPhone(), "signup");
      expect(res.status).toBe(200);
      expect(res.body.data.isNewAccount).toBe(true);
      expect(res.body.data.user.isPhoneVerified).toBe(true);
    });

    for (const intent of ["signin", "signup"] as const) {
      it(`${intent} with an already-verified identifier just logs in`, async () => {
        const phone = randomPhone();
        const { user } = await createUser({ phone, phoneVerified: true });
        const res = await verify("phone", phone, intent);
        expect(res.status).toBe(200);
        expect(res.body.data.isNewAccount).toBe(false);
        expect(res.body.data.user.id).toBe(user.id);
      });
    }

    it("a bogus or expired signupToken is refused", async () => {
      const res = await request(app)
        .post("/api/auth/signup/confirm")
        .send({ signupToken: randomUUID() });
      expect(res.status).toBe(401);
    });
  });

  describe("only verified identifiers log in", () => {
    it("an unverified phone never signs into its holder - sign-in reports no account", async () => {
      const phone = randomPhone();
      const { user: holder } = await createUser({ phone, phoneVerified: false });

      const res = await verify("phone", phone, "signin");
      expect(res.body.data.noAccount).toBe(true);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: holder.id } })).phone).toBe(phone);
    });

    it("signing up with a phone held unverified elsewhere: the prover gets it, the other claim is cleared", async () => {
      const phone = randomPhone();
      const { user: holder } = await createUser({ phone, phoneVerified: false });

      const res = await verify("phone", phone, "signup");
      expect(res.body.data.isNewAccount).toBe(true);
      expect(res.body.data.user.id).not.toBe(holder.id);

      const after = await prisma.user.findUniqueOrThrow({ where: { id: holder.id } });
      expect(after.phone).toBeNull();
      expect(after.hasWhatsapp).toBe(false);
    });

    it("an unverified email never signs into its holder either", async () => {
      const email = randomEmail();
      await createUser({ email, emailVerified: false });
      const res = await verify("email", email, "signin");
      expect(res.body.data.noAccount).toBe(true);
    });
  });

  describe("adding/changing a phone (POST /api/users/me/identifiers/claim/*)", () => {
    async function claim(token: string, userId: string, phone: string) {
      const code = await issueOtp(claimOtpIdentifier(userId, "phone", phone));
      return request(app)
        .post("/api/users/me/identifiers/claim/verify")
        .set("Authorization", `Bearer ${token}`)
        .send({ channel: "phone", identifier: phone, code });
    }

    it("request sends the code by SMS and writes nothing yet", async () => {
      const { user, token } = await createUser({ email: randomEmail(), emailVerified: true });
      const phone = randomPhone();
      const res = await request(app)
        .post("/api/users/me/identifiers/claim/request")
        .set("X-Forwarded-For", clientIp)
        .set("Authorization", `Bearer ${token}`)
        .send({ channel: "phone", identifier: phone });
      expect(res.status).toBe(200);
      await vi.waitFor(() => expect(smsSpy).toHaveBeenCalledTimes(1));
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).phone).toBeNull();
    });

    it("verifies the phone, and it then logs in", async () => {
      const { user, token } = await createUser({ email: randomEmail(), emailVerified: true });
      const phone = randomPhone();
      const res = await claim(token, user.id, phone);
      expect(res.status).toBe(200);
      expect(res.body.data.user.isPhoneVerified).toBe(true);

      const login = await verify("phone", phone, "signin");
      expect(login.body.data.user.id).toBe(user.id);
    });

    it("the proven owner wins over another account's unverified claim", async () => {
      const phone = randomPhone();
      const { user: holder } = await createUser({ phone, phoneVerified: false });
      const { user, token } = await createUser({ email: randomEmail(), emailVerified: true });

      const res = await claim(token, user.id, phone);
      expect(res.status).toBe(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: holder.id } })).phone).toBeNull();
    });

    it("never takes a phone another account has verified", async () => {
      const phone = randomPhone();
      const { user: holder } = await createUser({ phone, phoneVerified: true });
      const { user, token } = await createUser({ email: randomEmail(), emailVerified: true });

      const res = await claim(token, user.id, phone);
      expect(res.status).toBe(409);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: holder.id } });
      expect(after.phone).toBe(phone);
      expect(after.phoneVerifiedAt).not.toBeNull();
    });

    it("PATCH /me/profile can't change or clear a verified phone", async () => {
      const phone = randomPhone();
      const { token } = await createUser({
        email: randomEmail(),
        emailVerified: true,
        phone,
        phoneVerified: true,
      });
      for (const next of [randomPhone(), ""]) {
        const res = await request(app)
          .patch("/api/users/me/profile")
          .set("Authorization", `Bearer ${token}`)
          .field("fullName", "Verified Phone")
          .field("phone", next);
        expect(res.status).toBe(409);
      }
    });

    it("complete-profile never overwrites a verified phone", async () => {
      const phone = randomPhone();
      const { token } = await createUser({ phone, phoneVerified: true });
      const res = await request(app)
        .post("/api/auth/complete-profile")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Phone Signup", phone: randomPhone() });
      expect(res.status).toBe(400);
    });
  });

  it("limits code checks to 10 per identifier per hour", async () => {
    const email = randomEmail();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await request(app)
        .post("/api/auth/otp/verify")
        .send({ channel: "email", identifier: email, code: "482915", intent: "signin" });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("GET /api/auth/options reports what the screens may offer", async () => {
    vi.stubEnv("REQUIRE_PHONE_VERIFICATION", "true");
    vi.stubEnv("SMS_ALLOWED_COUNTRY_CODES", "91");
    const res = await request(app).get("/api/auth/options");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      phoneOtpAvailable: true,
      requirePhoneVerification: true,
      smsCountryCodes: ["91"],
    });
  });
});

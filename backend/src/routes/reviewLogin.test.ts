import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { issueSessionToken } from "../lib/session";
import { issueOtp } from "../lib/otpStore";
import { loginOtpIdentifier } from "../lib/identity";
import { checkReviewLoginConfigAtStartup } from "../lib/reviewAccess";

// Play reviewer login (lib/reviewAccess.ts): REVIEW_OTP accepted only for
// exactly REVIEW_EMAIL, only while both vars are set, never for any other
// identifier or flow; the account passes every verification gate even with
// REQUIRE_PHONE_VERIFICATION=true; unsetting the vars ends it, sessions
// included. Env is read per call, so vi.stubEnv toggles it live.
//
// Assumes no other isReviewAccount user exists in the local DB (the login
// signs into the oldest one) - beforeAll fails loudly if one does.
describe("Play reviewer login (REVIEW_EMAIL / REVIEW_OTP)", () => {
  const REVIEW_DOMAIN = "review-login.test.example";
  const REVIEW_EMAIL = `reviewer-${randomUUID()}@${REVIEW_DOMAIN}`;
  const REVIEW_OTP = "482915";
  const userIds: string[] = [];

  function enable(email = REVIEW_EMAIL, code = REVIEW_OTP) {
    vi.stubEnv("REVIEW_EMAIL", email);
    vi.stubEnv("REVIEW_OTP", code);
  }

  function verify(body: Record<string, unknown>) {
    return request(app)
      .post("/api/auth/otp/verify")
      .send({ intent: "signin", ...body });
  }

  async function cleanupReviewAccounts() {
    const reviewers = await prisma.user.findMany({
      where: { isReviewAccount: true, email: { endsWith: `@${REVIEW_DOMAIN}` } },
      select: { id: true },
    });
    const ids = reviewers.map((r) => r.id);
    await prisma.listing.deleteMany({ where: { sellerId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  // Only this suite's own key - other suites run in parallel and keep
  // their own verify-limit counters (see otpAuth.test.ts).
  async function resetVerifyLimits() {
    await redis.del(`rl:otp-verify:email:${REVIEW_EMAIL}`);
  }

  beforeAll(async () => {
    await cleanupReviewAccounts();
    const others = await prisma.user.count({ where: { isReviewAccount: true } });
    if (others > 0) {
      throw new Error(
        "A review account (isReviewAccount=true) already exists in the local DB - " +
          "these tests would sign into it. Remove it first.",
      );
    }
  });

  beforeEach(async () => {
    vi.unstubAllEnvs();
    // Pinned so the outcomes below never depend on a local .env.
    vi.stubEnv("REVIEW_EMAIL", "");
    vi.stubEnv("REVIEW_OTP", "");
    vi.stubEnv("REQUIRE_PHONE_VERIFICATION", "false");
    await resetVerifyLimits();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await cleanupReviewAccounts();
    await prisma.listing.deleteMany({ where: { sellerId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  describe("inert when the vars are unset", () => {
    it("neither var set: REVIEW_OTP is just a wrong code", async () => {
      const res = await verify({ channel: "email", identifier: REVIEW_EMAIL, code: REVIEW_OTP });
      expect(res.status).toBe(401);
    });

    it("only one var set: still a wrong code", async () => {
      vi.stubEnv("REVIEW_EMAIL", REVIEW_EMAIL);
      expect(
        (await verify({ channel: "email", identifier: REVIEW_EMAIL, code: REVIEW_OTP })).status,
      ).toBe(401);

      vi.stubEnv("REVIEW_EMAIL", "");
      vi.stubEnv("REVIEW_OTP", REVIEW_OTP);
      expect(
        (await verify({ channel: "email", identifier: REVIEW_EMAIL, code: REVIEW_OTP })).status,
      ).toBe(401);
    });

    it("a guessable REVIEW_OTP is never accepted, even with both set", async () => {
      enable(REVIEW_EMAIL, "123456");
      const res = await verify({ channel: "email", identifier: REVIEW_EMAIL, code: "123456" });
      expect(res.status).toBe(401);
    });
  });

  describe("enabled", () => {
    it("signs in with exactly REVIEW_EMAIL (case/whitespace-insensitive) + REVIEW_OTP, logged distinctly", async () => {
      enable();
      const warn = vi.spyOn(console, "warn");

      const res = await verify({
        channel: "email",
        identifier: `  ${REVIEW_EMAIL.toUpperCase()} `,
        code: REVIEW_OTP,
      });
      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe(REVIEW_EMAIL);
      expect(res.body.data.user.isVerified).toBe(true);
      expect(res.body.data.user.isPhoneVerified).toBe(true);
      expect(warn.mock.calls.some(([msg]) => String(msg).startsWith("[review-login]"))).toBe(true);

      // Nothing verified is stored - it's computed while the vars are set.
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: res.body.data.user.id } });
      expect(stored.isReviewAccount).toBe(true);
      expect(stored.emailVerifiedAt).toBeNull();
      expect(stored.phoneVerifiedAt).toBeNull();

      // Same account again next time, not a new one.
      const again = await verify({ channel: "email", identifier: REVIEW_EMAIL, code: REVIEW_OTP });
      expect(again.body.data.user.id).toBe(res.body.data.user.id);
      expect(again.body.data.isNewAccount).toBe(false);
    });

    it("REVIEW_OTP fails for every other identifier", async () => {
      enable();
      const [local, domain] = REVIEW_EMAIL.split("@");
      const others = [
        { channel: "email", identifier: `other-${randomUUID()}@example.com` },
        { channel: "email", identifier: `${local}+x@${domain}` },
        { channel: "email", identifier: `${local}@example.com` },
        { channel: "phone", identifier: "+919876543210" },
        { channel: "phone", identifier: REVIEW_EMAIL },
      ];
      for (const other of others) {
        const res = await verify({ ...other, code: REVIEW_OTP });
        expect([400, 401]).toContain(res.status);
      }
      expect(await prisma.user.count({ where: { isReviewAccount: true } })).toBeLessThanOrEqual(1);
    });

    it("REVIEW_OTP is never accepted by the add-identifier flow", async () => {
      enable();
      const user = await prisma.user.create({
        data: { email: `claimer-${randomUUID()}@example.com` },
      });
      userIds.push(user.id);
      const res = await request(app)
        .post("/api/users/me/identifiers/claim/verify")
        .set("Authorization", `Bearer ${await issueSessionToken(user)}`)
        .send({ channel: "email", identifier: REVIEW_EMAIL, code: REVIEW_OTP });
      expect(res.status).toBe(401);
    });

    it("a normal emailed code for REVIEW_EMAIL still follows the normal rules (it's not the review path)", async () => {
      enable();
      // Any code other than REVIEW_OTP goes through the regular OTP store.
      const res = await verify({ channel: "email", identifier: REVIEW_EMAIL, code: "739104" });
      expect(res.status).toBe(401);
    });

    it("passes every gate with REQUIRE_PHONE_VERIFICATION=true, without any phone", async () => {
      enable();
      vi.stubEnv("REQUIRE_PHONE_VERIFICATION", "true");
      const login = await verify({ channel: "email", identifier: REVIEW_EMAIL, code: REVIEW_OTP });
      const auth = { Authorization: `Bearer ${login.body.data.token}` };

      // Each probe fails *after* the gate (bad body / unknown id) - see
      // verificationGate.test.ts. The listing one also gets past the
      // phone-on-file check, so it reaches field validation (400).
      const list = await request(app).post("/api/listings").set(auth).field("movieName", "");
      expect(list.status).toBe(400);
      expect(list.body.error).not.toContain("phone");
      const reserve = await request(app)
        .post(`/api/listings/${randomUUID()}/reserve`)
        .set(auth)
        .send({ seats: 1 });
      expect(reserve.status).not.toBe(403);
      const contact = await request(app).get(`/api/transactions/${randomUUID()}/contact`).set(auth);
      expect(contact.status).toBe(404);
    });

    it("refuses to sign into a regular account that holds REVIEW_EMAIL", async () => {
      const email = `taken-${randomUUID()}@${REVIEW_DOMAIN}`;
      enable(email);
      const regular = await prisma.user.create({ data: { email } });
      userIds.push(regular.id);
      const warn = vi.spyOn(console, "warn");

      const res = await verify({ channel: "email", identifier: email, code: REVIEW_OTP });
      expect(res.status).toBe(401);
      expect(warn.mock.calls.some(([msg]) => String(msg).includes("REFUSED"))).toBe(true);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: regular.id } });
      expect(after.isReviewAccount).toBe(false);
      expect(after.emailVerifiedAt).toBeNull();
    });

    it("limits guesses at the fixed code: 10 per hour for REVIEW_EMAIL", async () => {
      enable();
      for (let i = 0; i < 10; i++) {
        const res = await verify({ channel: "email", identifier: REVIEW_EMAIL, code: "739104" });
        expect(res.status).toBe(401);
      }
      const res = await verify({ channel: "email", identifier: REVIEW_EMAIL, code: REVIEW_OTP });
      expect(res.status).toBe(429);
    });
  });

  describe("removing the vars disables it fully", () => {
    it("ends an existing reviewer session and drops its verified status", async () => {
      enable();
      const login = await verify({ channel: "email", identifier: REVIEW_EMAIL, code: REVIEW_OTP });
      const auth = { Authorization: `Bearer ${login.body.data.token}` };
      expect((await request(app).get("/api/auth/me").set(auth)).status).toBe(200);

      vi.stubEnv("REVIEW_EMAIL", "");
      vi.stubEnv("REVIEW_OTP", "");
      expect((await request(app).get("/api/auth/me").set(auth)).status).toBe(401);
      expect(
        (await verify({ channel: "email", identifier: REVIEW_EMAIL, code: REVIEW_OTP })).status,
      ).toBe(401);
    });

    it("leaves no stored identity a normal login could use", async () => {
      enable();
      await verify({ channel: "email", identifier: REVIEW_EMAIL, code: REVIEW_OTP });
      vi.stubEnv("REVIEW_EMAIL", "");
      vi.stubEnv("REVIEW_OTP", "");

      // A real emailed code for that address now treats it as an unknown
      // identifier (the review account's email was never verified).
      const code = await issueOtp(loginOtpIdentifier("email", REVIEW_EMAIL));
      const res = await verify({ channel: "email", identifier: REVIEW_EMAIL, code });
      expect(res.status).toBe(200);
      expect(res.body.data.noAccount).toBe(true);
    });
  });

  describe("the review account's listings are hidden from everyone else", () => {
    it("search, detail and reserve don't see them; the reviewer does", async () => {
      enable();
      const login = await verify({ channel: "email", identifier: REVIEW_EMAIL, code: REVIEW_OTP });
      const reviewerId = login.body.data.user.id as string;
      const reviewerAuth = { Authorization: `Bearer ${login.body.data.token}` };

      const lat = 12.9716;
      const lng = 77.5946;
      const listing = await prisma.listing.create({
        data: {
          sellerId: reviewerId,
          movieName: `Review Test ${randomUUID()}`,
          theaterName: "Review Test Theater",
          theaterLat: lat,
          theaterLng: lng,
          showtime: new Date(Date.now() + 24 * 60 * 60 * 1000),
          bookingId: `REVIEW${randomUUID()}`.slice(0, 20),
          totalSeats: 2,
          availableSeats: 2,
          pricePerSeat: 200,
        },
      });

      const buyer = await prisma.user.create({
        data: { email: `buyer-${randomUUID()}@example.com`, emailVerifiedAt: new Date() },
      });
      userIds.push(buyer.id);
      const buyerAuth = { Authorization: `Bearer ${await issueSessionToken(buyer)}` };

      const searchAs = async (auth?: Record<string, string>) => {
        const req = request(app).get("/api/listings/search").query({ lat, lng });
        const res = auth ? await req.set(auth) : await req;
        return (res.body.data.listings as { id: string }[]).some((l) => l.id === listing.id);
      };
      expect(await searchAs()).toBe(false);
      expect(await searchAs(buyerAuth)).toBe(false);
      expect(await searchAs(reviewerAuth)).toBe(true);

      const detailAs = (auth: Record<string, string>) =>
        request(app).get(`/api/listings/${listing.id}`).set(auth);
      expect((await detailAs(buyerAuth)).status).toBe(404);
      expect((await detailAs(reviewerAuth)).status).toBe(200);

      const reserve = await request(app)
        .post(`/api/listings/${listing.id}/reserve`)
        .set(buyerAuth)
        .send({ seats: 1, deliveryMethod: "IN_PERSON" });
      expect(reserve.status).toBe(404);
    });
  });

  describe("startup check", () => {
    it("refuses to boot on a guessable or malformed REVIEW_OTP, warns on a half-set pair", () => {
      enable(REVIEW_EMAIL, "000000");
      expect(() => checkReviewLoginConfigAtStartup()).toThrow();
      enable(REVIEW_EMAIL, "12345");
      expect(() => checkReviewLoginConfigAtStartup()).toThrow();
      enable("not-an-email", REVIEW_OTP);
      expect(() => checkReviewLoginConfigAtStartup()).toThrow();

      const warn = vi.spyOn(console, "warn");
      vi.stubEnv("REVIEW_OTP", "");
      vi.stubEnv("REVIEW_EMAIL", REVIEW_EMAIL);
      expect(() => checkReviewLoginConfigAtStartup()).not.toThrow();
      expect(warn.mock.calls.some(([msg]) => String(msg).includes("DISABLED"))).toBe(true);
    });
  });
});

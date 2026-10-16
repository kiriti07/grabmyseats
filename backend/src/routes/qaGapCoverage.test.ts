import "dotenv/config";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import type { Router } from "express";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { issueSessionToken } from "../lib/session";
import { issueAdminSessionToken } from "../lib/adminSession";
import { issueOtp } from "../lib/otpStore";
import { loginOtpIdentifier } from "../lib/identity";
import { emailProvider } from "../lib/email";
import { ticketImage } from "../test/ticketImage";
import { authRouter } from "./auth";
import { listingsRouter } from "./listings";
import { transactionsRouter } from "./transactions";
import { usersRouter } from "./users";
import { alertsRouter } from "./alerts";
import { pushTokensRouter } from "./pushTokens";
import { fraudReportsRouter } from "./fraudReports";
import { adminRouter } from "./admin";
import { adminAuthRouter } from "./adminAuth";
import { adminStaffRouter } from "./adminStaff";

// Pre-launch QA gap coverage: the paths the per-feature suites don't
// already exercise - expired/reused/concurrently-replayed OTPs, the
// DEV_OTP_BYPASS_CODE production guards, self-referral, the CORS
// allowlist, an auth sweep over every mounted route, and secrets in
// response bodies. Same pattern as the other route suites: real local
// Postgres + Redis through the actual Express app, email provider spied.
describe("QA gap coverage", () => {
  const userIds: string[] = [];
  const listingIds: string[] = [];
  const adminIds: string[] = [];

  const randomEmail = () => `qa-gap-${randomUUID()}@example.com`;
  const randomPhone = () => `+91${Math.floor(6_000_000_000 + Math.random() * 3_999_999_999)}`;
  const randomClientIp = () => {
    const octet = () => Math.floor(Math.random() * 254) + 1;
    return `10.${octet()}.${octet()}.${octet()}`;
  };

  async function createUser(opts: { email?: string; phone?: string } = {}) {
    const user = await prisma.user.create({
      data: {
        email: opts.email ?? randomEmail(),
        emailVerifiedAt: new Date(),
        phone: opts.phone ?? randomPhone(),
        fullName: "QA Gap User",
      },
    });
    userIds.push(user.id);
    return { user, token: await issueSessionToken(user) };
  }

  function verify(identifier: string, code: string, extra: Record<string, unknown> = {}) {
    return request(app)
      .post("/api/auth/otp/verify")
      .set("X-Forwarded-For", randomClientIp())
      .send({ channel: "email", identifier, code, intent: "signup", ...extra })
      .then((res) => {
        if (res.body?.data?.user?.id) userIds.push(res.body.data.user.id);
        return res;
      });
  }

  let emailSpy: MockInstance<(to: string, subject: string, body: string) => Promise<void>>;
  beforeEach(() => {
    emailSpy = vi.spyOn(emailProvider, "send").mockResolvedValue(undefined);
  });
  afterEach(() => {
    emailSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { listingId: { in: listingIds } } });
    await prisma.listingContact.deleteMany({ where: { listingId: { in: listingIds } } });
    await prisma.listingView.deleteMany({ where: { listingId: { in: listingIds } } });
    await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
    await prisma.pointsLedger.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } });
  });

  describe("A. OTP lifecycle", () => {
    it("codes live for 5 minutes", async () => {
      const email = randomEmail();
      await issueOtp(loginOtpIdentifier("email", email));
      const ttl = await redis.ttl(`otp:${loginOtpIdentifier("email", email)}`);
      expect(ttl).toBeGreaterThan(290);
      expect(ttl).toBeLessThanOrEqual(300);
    });

    it("an expired code is refused with the generic 401", async () => {
      const email = randomEmail();
      const id = loginOtpIdentifier("email", email);
      const code = await issueOtp(id);
      await redis.pexpire(`otp:${id}`, 1);
      await new Promise((r) => setTimeout(r, 20));
      const res = await verify(email, code);
      expect(res.status).toBe(401);
    });

    it("a correct code works once - replaying it afterwards is a 401", async () => {
      const email = randomEmail();
      const code = await issueOtp(loginOtpIdentifier("email", email));
      const first = await verify(email, code);
      expect(first.status).toBe(200);
      const second = await verify(email, code);
      expect(second.status).toBe(401);
    });

    it("two simultaneous verifies of one correct code: at most one succeeds", async () => {
      const email = randomEmail();
      const code = await issueOtp(loginOtpIdentifier("email", email));
      const results = await Promise.all([verify(email, code), verify(email, code), verify(email, code)]);
      const ok = results.filter((r) => r.status === 200);
      // Whatever the outcome, a replay race must never mint duplicate accounts.
      const accounts = await prisma.user.count({ where: { email } });
      expect(accounts).toBe(1);
      expect(results.map((r) => r.status).sort()).toEqual([200, 401, 401]);
    });
  });

  describe("A. DEV_OTP_BYPASS_CODE", () => {
    const BYPASS = "246810";

    it("is honoured outside production (control - proves the code path is live)", async () => {
      vi.stubEnv("DEV_OTP_BYPASS_CODE", BYPASS);
      const res = await verify(randomEmail(), BYPASS);
      expect(res.status).toBe(200);
    });

    it("is refused when NODE_ENV=production even if the var is set", async () => {
      vi.stubEnv("DEV_OTP_BYPASS_CODE", BYPASS);
      vi.stubEnv("NODE_ENV", "production");
      const res = await verify(randomEmail(), BYPASS);
      expect(res.status).toBe(401);
    });

    it("the server refuses to boot with NODE_ENV=production and the var set", () => {
      const backendRoot = path.resolve(__dirname, "../..");
      const run = spawnSync(
        process.execPath,
        ["-r", "ts-node/register/transpile-only", "-e", "require('./src/index')"],
        {
          cwd: backendRoot,
          env: { ...process.env, NODE_ENV: "production", DEV_OTP_BYPASS_CODE: BYPASS, PORT: "0" },
          encoding: "utf8",
          timeout: 60_000,
        },
      );
      expect(run.status).not.toBe(0);
      expect(run.stderr).toContain("DEV_OTP_BYPASS_CODE must not be set when NODE_ENV=production");
    });
  });

  describe("B. self-referral", () => {
    it("an existing user signing in with their own code is not linked to themselves", async () => {
      const email = randomEmail();
      const signup = await verify(email, await issueOtp(loginOtpIdentifier("email", email)));
      expect(signup.status).toBe(200);
      const me = await prisma.user.findUniqueOrThrow({ where: { id: signup.body.data.user.id } });

      const again = await verify(email, await issueOtp(loginOtpIdentifier("email", email)), {
        ref: me.referralCode,
      });
      expect(again.status).toBe(200);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
      expect(after.referredByUserId).toBeNull();
    });

    it("a new account's referral link points at the referrer, never at itself", async () => {
      const { user: referrer } = await createUser();
      const email = randomEmail();
      const res = await verify(email, await issueOtp(loginOtpIdentifier("email", email)), {
        ref: referrer.referralCode,
      });
      const created = await prisma.user.findUniqueOrThrow({ where: { id: res.body.data.user.id } });
      expect(created.referredByUserId).toBe(referrer.id);
      expect(created.referralCode).not.toBe(referrer.referralCode);
    });
  });

  describe("J. CORS allowlist", () => {
    const preflight = (origin: string) =>
      request(app)
        .options("/api/auth/options")
        .set("Origin", origin)
        .set("Access-Control-Request-Method", "GET");

    for (const origin of [
      "https://grabmyseats.com",
      "https://www.grabmyseats.com",
      "https://grabmyseats-frontend.vercel.app",
    ]) {
      it(`allows ${origin}`, async () => {
        const res = await preflight(origin);
        expect(res.headers["access-control-allow-origin"]).toBe(origin);
        expect(res.headers["access-control-allow-credentials"]).toBe("true");
      });
    }

    for (const origin of [
      "https://evil.example",
      "https://grabmyseats.com.evil.example",
      "https://evilgrabmyseats.com",
      "http://grabmyseats.com",
      "https://grabmyseats-frontend-git-main-someone.vercel.app",
      "null",
    ]) {
      it(`does not allow ${origin}`, async () => {
        const res = await preflight(origin);
        expect(res.headers["access-control-allow-origin"]).toBeUndefined();
      });
    }
  });

  describe("J. auth sweep over every mounted route", () => {
    const mounts: [string, Router][] = [
      ["/api/auth", authRouter],
      ["/api/listings", listingsRouter],
      ["/api/transactions", transactionsRouter],
      ["/api/users", usersRouter],
      ["/api/alerts", alertsRouter],
      ["/api/push", pushTokensRouter],
      ["/api/fraud-reports", fraudReportsRouter],
      ["/api/admin/auth", adminAuthRouter],
      ["/api/admin", adminStaffRouter],
      ["/api/admin", adminRouter],
    ];

    // Intentionally reachable without a session (by design, per the code
    // comments on each route).
    const PUBLIC = new Set([
      "GET /api/auth/options",
      "POST /api/auth/otp/request",
      "POST /api/auth/otp/verify",
      "POST /api/auth/signup/confirm",
      "GET /api/listings/search",
      "GET /api/users/:id/rating-summary",
      "GET /api/users/me/email/verify",
      "POST /api/admin/auth/login",
      "POST /api/admin/auth/logout",
    ]);

    type Route = { method: string; path: string };
    const routes: Route[] = [];
    for (const [base, router] of mounts) {
      for (const layer of (router as unknown as { stack: { route?: { path: string; methods: Record<string, boolean> } }[] }).stack) {
        if (!layer.route) continue;
        for (const method of Object.keys(layer.route.methods)) {
          routes.push({ method: method.toUpperCase(), path: base + layer.route.path });
        }
      }
    }

    it("found the routes to sweep", () => {
      expect(routes.length).toBeGreaterThan(40);
    });

    const concrete = (p: string) => p.replace(/:[A-Za-z]+/g, randomUUID());
    const send = (r: Route, token?: string) => {
      const m = r.method.toLowerCase() as "get" | "post" | "patch" | "delete" | "put";
      let req = request(app)[m](concrete(r.path)).set("X-Forwarded-For", randomClientIp());
      if (token) req = req.set("Authorization", `Bearer ${token}`);
      return m === "get" || m === "delete" ? req : req.send({});
    };

    it("every non-public route refuses an anonymous caller (401, or 404 for escrow-only routes in contact_only)", async () => {
      const leaks: string[] = [];
      for (const r of routes) {
        const key = `${r.method} ${r.path}`;
        if (PUBLIC.has(key)) continue;
        const res = await send(r);
        if (![401, 404].includes(res.status)) leaks.push(`${key} -> ${res.status}`);
        if (res.status === 404 && !/\/(pay|check-in|confirm-receipt)$/.test(r.path)) {
          leaks.push(`${key} -> 404 before auth`);
        }
      }
      expect(leaks).toEqual([]);
    });

    it("every /api/admin route refuses a customer session token", async () => {
      const { token } = await createUser();
      const leaks: string[] = [];
      for (const r of routes) {
        const key = `${r.method} ${r.path}`;
        if (!r.path.startsWith("/api/admin") || PUBLIC.has(key)) continue;
        const res = await send(r, token);
        if (![401, 403].includes(res.status)) leaks.push(`${key} -> ${res.status}`);
      }
      expect(leaks).toEqual([]);
    });

    it("an admin session token is not accepted as a customer session", async () => {
      const admin = await prisma.adminUser.create({
        data: { username: `qa-gap-admin-${randomUUID()}`, passwordHash: "n/a", role: "ADMIN" },
      });
      adminIds.push(admin.id);
      const adminToken = await issueAdminSessionToken(admin);
      const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(401);
    });
  });

  describe("J. no secrets in responses", () => {
    it("auth, profile, listing, search, referral and admin responses carry no secret values or internal fields", async () => {
      const seller = await createUser();
      const buyer = await createUser();

      const created = await request(app)
        .post("/api/listings")
        .set("Authorization", `Bearer ${seller.token}`)
        .field("category", "MOVIE")
        .field("movieName", "QA Secret Scan Movie")
        .field("theaterName", "QA Cinemas")
        .field("city", "Hyderabad")
        .field("theaterLat", "17.4401")
        .field("theaterLng", "78.3489")
        .field("bookingId", `QA${randomUUID()}`.slice(0, 20))
        .field("totalSeats", "2")
        .field("pricePerSeat", "200")
        .field("showtime", new Date(Date.now() + 24 * 3600_000).toISOString())
        .attach("screenshot", await ticketImage(), { filename: "t.png", contentType: "image/png" });
      expect(created.status).toBe(201);
      const listingId = created.body.data.listing.id as string;
      listingIds.push(listingId);

      const admin = await prisma.adminUser.create({
        data: { username: `qa-gap-admin-${randomUUID()}`, passwordHash: "$2b$10$notarealhashnotarealhashnotarealhashnotarealhas", role: "ADMIN" },
      });
      adminIds.push(admin.id);
      const adminToken = await issueAdminSessionToken(admin);

      const bodies = await Promise.all([
        request(app).get("/api/auth/options"),
        request(app).get("/api/auth/me").set("Authorization", `Bearer ${seller.token}`),
        request(app).get("/api/users/me/profile").set("Authorization", `Bearer ${seller.token}`),
        request(app).get("/api/users/me/referrals").set("Authorization", `Bearer ${seller.token}`),
        request(app).get(`/api/listings/${listingId}`).set("Authorization", `Bearer ${buyer.token}`),
        request(app).get("/api/listings/mine").set("Authorization", `Bearer ${seller.token}`),
        request(app).get("/api/listings/search?lat=17.4401&lng=78.3489&radiusKm=5"),
        request(app).post(`/api/listings/${listingId}/reserve`).set("Authorization", `Bearer ${buyer.token}`).send({ seats: 1 }),
        request(app).get("/api/admin/auth/me").set("Authorization", `Bearer ${adminToken}`),
        request(app).get("/api/admin/staff").set("Authorization", `Bearer ${adminToken}`),
        request(app).get(`/api/admin/users?email=${encodeURIComponent(seller.user.email!)}`).set("Authorization", `Bearer ${adminToken}`),
      ]);
      for (const res of bodies) expect(res.status, res.req.path).toBeLessThan(400);

      const dbPassword = new URL(process.env.DATABASE_URL!).password;
      const secrets = [
        process.env.AUTH_SECRET,
        process.env.ADMIN_AUTH_SECRET,
        process.env.TICKET_FINGERPRINT_SECRET,
        dbPassword,
      ].filter((s): s is string => !!s && s.length >= 6);
      const forbiddenKeys = /"(passwordHash|ticketFingerprint|qrData|otp|otpCode|signupToken|referralMilestoneThreshold|razorpayKeySecret)"\s*:/;

      const problems: string[] = [];
      for (const res of bodies) {
        const text = JSON.stringify(res.body);
        for (const s of secrets) if (text.includes(s)) problems.push(`${res.req.path}: contains a secret value`);
        const m = text.match(forbiddenKeys);
        if (m) problems.push(`${res.req.path}: exposes field ${m[1]}`);
      }
      expect(problems).toEqual([]);
    });

    it("an unhandled error returns a generic 500 body, not a stack trace", async () => {
      const { token } = await createUser();
      const spy = vi.spyOn(prisma.listing, "findMany").mockRejectedValueOnce(new Error("boom: secret-ish internal detail"));
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await request(app).get("/api/listings/mine").set("Authorization", `Bearer ${token}`);
      spy.mockRestore();
      err.mockRestore();
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain("boom");
    });
  });
});

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { issueSessionToken } from "../lib/session";
import { issueAdminSessionToken } from "../lib/adminSession";
import { issueOtp } from "../lib/otpStore";
import { issueEmailVerificationToken } from "../lib/emailVerificationStore";
import { claimOtpIdentifier, loginOtpIdentifier } from "../lib/emailIdentity";
import { emailProvider } from "../lib/email";

// End-to-end coverage for email-OTP login and everything that hangs off
// "an email is a login identity only once verified" (lib/emailIdentity.ts):
// POST /api/auth/otp/request + /otp/verify, the add/change-email claim
// flow (POST /api/users/me/email/claim/*), the link-verify flow's conflict
// handling, phone collection (complete-profile, PATCH profile, the
// listing-creation gate), and admin lookup by email - against the real
// local Postgres + Redis through the actual Express app, not mocked. The
// email provider is only spied on, so no mail goes anywhere.
describe("email login", () => {
  const userIds: string[] = [];
  const listingIds: string[] = [];
  const adminIds: string[] = [];

  function randomEmail(label = "login"): string {
    return `${label}-${randomUUID()}@example.com`;
  }

  // A real E.164 number, for the places that validate format (the
  // UUID-suffixed default in createUser below is fine everywhere else).
  function randomE164(): string {
    return `+91${Math.floor(1_000_000_000 + Math.random() * 8_999_999_999)}`;
  }

  async function createUser(data: {
    email?: string;
    verified?: boolean;
    phone?: string | null;
    name?: string;
  }) {
    const user = await prisma.user.create({
      data: {
        phone: data.phone === undefined ? `+1555login${randomUUID()}`.slice(0, 30) : data.phone,
        name: data.name ?? null,
        email: data.email ?? null,
        emailVerifiedAt: data.verified ? new Date() : null,
      },
    });
    userIds.push(user.id);
    return { user, token: await issueSessionToken(user) };
  }

  async function loginWithCode(email: string, extra: Record<string, string> = {}) {
    const code = await issueOtp(loginOtpIdentifier(email.trim().toLowerCase()));
    const res = await request(app)
      .post("/api/auth/otp/verify")
      .send({ email, code, ...extra });
    if (res.body?.data?.user?.id) userIds.push(res.body.data.user.id);
    return res;
  }

  // Every test in this file shares supertest's single loopback IP, and
  // these limiters' counters live in Redis across runs - so the IP and
  // global buckets are reset before each test. Per-email buckets never
  // need it: every test uses fresh addresses.
  async function resetSharedRateLimits() {
    for (const pattern of ["rl:otp-ip:*", "rl:otp-global:*"]) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) await redis.del(...keys);
    }
  }

  let sendSpy: MockInstance<(to: string, subject: string, body: string) => Promise<void>>;

  beforeEach(async () => {
    await resetSharedRateLimits();
    sendSpy = vi.spyOn(emailProvider, "send").mockResolvedValue(undefined);
  });

  afterEach(() => {
    sendSpy.mockRestore();
  });

  afterAll(async () => {
    await prisma.fraudReport.deleteMany({
      where: { OR: [{ reporterId: { in: userIds } }, { reportedUserId: { in: userIds } }] },
    });
    await prisma.transaction.deleteMany({ where: { listingId: { in: listingIds } } });
    await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } });
  });

  describe("POST /api/auth/otp/request", () => {
    it("returns the identical response for an existing account and a brand-new address", async () => {
      const existingEmail = randomEmail("existing");
      await createUser({ email: existingEmail, verified: true });

      const existing = await request(app).post("/api/auth/otp/request").send({ email: existingEmail });
      const fresh = await request(app).post("/api/auth/otp/request").send({ email: randomEmail("new") });

      expect(existing.status).toBe(200);
      expect(fresh.status).toBe(existing.status);
      expect(fresh.body).toEqual(existing.body);
    });

    it("emails a fixed-format code: subject with the code, plain body, no links", async () => {
      const email = randomEmail("format");
      const res = await request(app)
        .post("/api/auth/otp/request")
        .send({ email: `  ${email.toUpperCase()}  ` });
      expect(res.status).toBe(200);

      await vi.waitFor(() => expect(sendSpy).toHaveBeenCalledTimes(1));
      const [to, subject, body] = sendSpy.mock.calls[0] as [string, string, string];
      expect(to).toBe(email);
      expect(subject).toMatch(/^Your GrabMySeats code: \d{6}$/);
      const code = subject.slice(-6);
      expect(body).toContain(code);
      expect(body).not.toMatch(/https?:\/\//);
    });

    it("never puts caller-supplied extras (e.g. ref) into the email", async () => {
      const email = randomEmail("relay");
      await request(app)
        .post("/api/auth/otp/request")
        .send({ email, ref: "Visit http://evil.example", name: "Click here" });

      await vi.waitFor(() => expect(sendSpy).toHaveBeenCalledTimes(1));
      const [, subject, body] = sendSpy.mock.calls[0] as [string, string, string];
      expect(`${subject}${body}`).not.toContain("evil");
      expect(`${subject}${body}`).not.toContain("Click here");
    });

    it("400s an invalid address, and one carrying a CR/LF header-injection attempt", async () => {
      for (const email of ["not-an-email", "a@b.com\r\nBcc: victim@example.com", "", 42]) {
        const res = await request(app).post("/api/auth/otp/request").send({ email });
        expect(res.status).toBe(400);
      }
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it("rate-limits per inbox: a 4th request in 10 minutes is 429, and +tag aliases share the budget", async () => {
      const id = randomUUID();
      const aliases = [`rl-${id}@example.com`, `rl-${id}+a@example.com`, `RL-${id}+b@example.com`];
      for (const email of aliases) {
        const res = await request(app).post("/api/auth/otp/request").send({ email });
        expect(res.status).toBe(200);
      }

      const blocked = await request(app)
        .post("/api/auth/otp/request")
        .send({ email: `rl-${id}+c@example.com` });
      expect(blocked.status).toBe(429);
      // Says nothing about whether an account exists.
      expect(blocked.body.error).toBe("Too many requests. Please try again later.");
    });

    it("rate-limits per IP across different addresses", async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        const res = await request(app).post("/api/auth/otp/request").send({ email: randomEmail("ip") });
        statuses.push(res.status);
      }
      expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
      expect(statuses[10]).toBe(429);
    });
  });

  describe("POST /api/auth/otp/verify", () => {
    it("a new address creates an account with that email already verified, and no phone", async () => {
      const email = randomEmail("signup");
      const res = await loginWithCode(email);
      expect(res.status).toBe(200);
      expect(res.body.data.isNewAccount).toBe(true);
      expect(res.body.data.user.email).toBe(email);
      expect(res.body.data.user.isVerified).toBe(true);
      expect(res.body.data.user.phone).toBeNull();
    });

    it("an existing verified address logs into that account, case-insensitively", async () => {
      const id = randomUUID();
      const { user } = await createUser({ email: `Mixed-${id}@Example.com`, verified: true });

      const res = await loginWithCode(`mixed-${id}@example.com`);
      expect(res.status).toBe(200);
      expect(res.body.data.isNewAccount).toBe(false);
      expect(res.body.data.user.id).toBe(user.id);
    });

    it("an address held only UNVERIFIED never logs into that account - the prover gets a new one and the old claim is cleared", async () => {
      const email = randomEmail("squat");
      const { user: squatter } = await createUser({ email, verified: false });

      const res = await loginWithCode(email);
      expect(res.status).toBe(200);
      expect(res.body.data.isNewAccount).toBe(true);
      expect(res.body.data.user.id).not.toBe(squatter.id);
      expect(res.body.data.user.email).toBe(email);
      expect(res.body.data.user.isVerified).toBe(true);

      const after = await prisma.user.findUniqueOrThrow({ where: { id: squatter.id } });
      expect(after.email).toBeNull();
      expect(after.emailVerifiedAt).toBeNull();
    });

    it("also clears a case-variant unverified claim when logging into the verified owner", async () => {
      const id = randomUUID();
      const { user: owner } = await createUser({ email: `owner-${id}@example.com`, verified: true });
      const { user: variant } = await createUser({ email: `OWNER-${id}@example.com`, verified: false });

      const res = await loginWithCode(`owner-${id}@example.com`);
      expect(res.body.data.user.id).toBe(owner.id);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: variant.id } })).email).toBeNull();
    });

    it("a wrong code is rejected and consumes the real one", async () => {
      const email = randomEmail("wrong");
      const code = await issueOtp(loginOtpIdentifier(email));
      const wrong = code === "000001" ? "000002" : "000001";

      const first = await request(app).post("/api/auth/otp/verify").send({ email, code: wrong });
      expect(first.status).toBe(401);
      const second = await request(app).post("/api/auth/otp/verify").send({ email, code });
      expect(second.status).toBe(401);
    });

    it("an add-email code can't be redeemed as a login code", async () => {
      const { user } = await createUser({});
      const email = randomEmail("crossflow");
      const code = await issueOtp(claimOtpIdentifier(user.id, email));

      const res = await request(app).post("/api/auth/otp/verify").send({ email, code });
      expect(res.status).toBe(401);
    });
  });

  describe("add / change email (POST /api/users/me/email/claim/*)", () => {
    it("requires auth", async () => {
      const res = await request(app)
        .post("/api/users/me/email/claim/request")
        .send({ email: randomEmail() });
      expect(res.status).toBe(401);
    });

    it("a legacy phone-only account adds an email, verified on the code, and can then log in with it", async () => {
      const { user, token } = await createUser({ name: "Legacy" });
      const email = randomEmail("legacy");

      const reqRes = await request(app)
        .post("/api/users/me/email/claim/request")
        .set("Authorization", `Bearer ${token}`)
        .send({ email });
      expect(reqRes.status).toBe(200);
      await vi.waitFor(() => expect(sendSpy).toHaveBeenCalledTimes(1));
      const [, subject] = sendSpy.mock.calls[0] as [string, string, string];
      const code = subject.slice(-6);

      // Nothing is written before the code is redeemed.
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email).toBeNull();

      const verifyRes = await request(app)
        .post("/api/users/me/email/claim/verify")
        .set("Authorization", `Bearer ${token}`)
        .send({ email, code });
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.user.email).toBe(email);
      expect(verifyRes.body.data.user.isVerified).toBe(true);

      const login = await loginWithCode(email);
      expect(login.body.data.isNewAccount).toBe(false);
      expect(login.body.data.user.id).toBe(user.id);
    });

    it("replaces the account's own unverified email - it never became a login identity first", async () => {
      const oldEmail = randomEmail("old-unverified");
      const { user, token } = await createUser({ email: oldEmail, verified: false });
      const email = randomEmail("new-verified");
      const code = await issueOtp(claimOtpIdentifier(user.id, email));

      const res = await request(app)
        .post("/api/users/me/email/claim/verify")
        .set("Authorization", `Bearer ${token}`)
        .send({ email, code });
      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe(email);
    });

    it("the proven owner wins over another account's unverified claim, which is cleared", async () => {
      const email = randomEmail("contested");
      const { user: squatter } = await createUser({ email, verified: false });
      const { user: owner, token } = await createUser({});
      const code = await issueOtp(claimOtpIdentifier(owner.id, email));

      const res = await request(app)
        .post("/api/users/me/email/claim/verify")
        .set("Authorization", `Bearer ${token}`)
        .send({ email, code });
      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe(email);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: squatter.id } })).email).toBeNull();
    });

    it("never takes over an address another account already has verified", async () => {
      const email = randomEmail("taken");
      const { user: holder } = await createUser({ email, verified: true });
      const { user: other, token } = await createUser({});
      const code = await issueOtp(claimOtpIdentifier(other.id, email));

      const res = await request(app)
        .post("/api/users/me/email/claim/verify")
        .set("Authorization", `Bearer ${token}`)
        .send({ email, code });
      expect(res.status).toBe(409);

      const holderAfter = await prisma.user.findUniqueOrThrow({ where: { id: holder.id } });
      expect(holderAfter.email).toBe(email);
      expect(holderAfter.emailVerifiedAt).not.toBeNull();
      expect((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).email).toBeNull();
    });

    it("a code is bound to the account that requested it", async () => {
      const { user: requester } = await createUser({});
      const { token: otherToken } = await createUser({});
      const email = randomEmail("bound");
      const code = await issueOtp(claimOtpIdentifier(requester.id, email));

      const res = await request(app)
        .post("/api/users/me/email/claim/verify")
        .set("Authorization", `Bearer ${otherToken}`)
        .send({ email, code });
      expect(res.status).toBe(401);
    });

    it("changes a verified email only once the new address is proven", async () => {
      const oldEmail = randomEmail("change-old");
      const { user, token } = await createUser({ email: oldEmail, verified: true });
      const newEmail = randomEmail("change-new");
      const code = await issueOtp(claimOtpIdentifier(user.id, newEmail));

      const res = await request(app)
        .post("/api/users/me/email/claim/verify")
        .set("Authorization", `Bearer ${token}`)
        .send({ email: newEmail, code });
      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe(newEmail);
      expect(res.body.data.user.isVerified).toBe(true);
    });
  });

  describe("link verification (GET /api/users/me/email/verify) conflict handling", () => {
    it("clears another account's case-variant unverified claim", async () => {
      const id = randomUUID();
      const { user: verifier } = await createUser({ email: `link-${id}@example.com` });
      const { user: variant } = await createUser({ email: `LINK-${id}@example.com` });
      const token = await issueEmailVerificationToken(verifier.id, verifier.email!);

      const res = await request(app).get(`/api/users/me/email/verify?token=${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.user.isVerified).toBe(true);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: variant.id } })).email).toBeNull();
    });

    it("is refused when another account already has the address verified", async () => {
      const id = randomUUID();
      await createUser({ email: `linkowned-${id}@example.com`, verified: true });
      const { user: verifier } = await createUser({ email: `LINKOWNED-${id}@example.com` });
      const token = await issueEmailVerificationToken(verifier.id, verifier.email!);

      const res = await request(app).get(`/api/users/me/email/verify?token=${token}`);
      expect(res.status).toBe(409);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: verifier.id } });
      expect(after.emailVerifiedAt).toBeNull();
    });
  });

  describe("phone (unverified, required to sell)", () => {
    it("complete-profile takes name + phone; phone is optional, validated, and unique", async () => {
      const { token } = await createUser({ email: randomEmail("cp"), verified: true, phone: null });

      const bad = await request(app)
        .post("/api/auth/complete-profile")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Asha", phone: "98765 43210" });
      expect(bad.status).toBe(400);

      const { user: holder } = await createUser({ phone: randomE164() });
      const taken = await request(app)
        .post("/api/auth/complete-profile")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Asha", phone: holder.phone });
      expect(taken.status).toBe(409);

      const phone = randomE164();
      const ok = await request(app)
        .post("/api/auth/complete-profile")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Asha", phone, hasWhatsapp: true });
      expect(ok.status).toBe(200);
      expect(ok.body.data.user.phone).toBe(phone);
      expect(ok.body.data.user.hasWhatsapp).toBe(true);
    });

    it("complete-profile without a phone still succeeds", async () => {
      const { token } = await createUser({ email: randomEmail("cp-nophone"), verified: true, phone: null });
      const res = await request(app)
        .post("/api/auth/complete-profile")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Ravi" });
      expect(res.status).toBe(200);
      expect(res.body.data.user.phone).toBeNull();
    });

    it("POST /api/listings refuses a seller with no phone", async () => {
      const { token } = await createUser({ email: randomEmail("nophone"), verified: true, phone: null });
      const res = await request(app)
        .post("/api/listings")
        .set("Authorization", `Bearer ${token}`)
        .field("movieName", "No Phone Movie");
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("phone");
    });

    it("PATCH profile sets a phone, and refuses to clear it while the user has a live listing", async () => {
      const { user, token } = await createUser({ phone: null });
      const phone = randomE164();

      const set = await request(app)
        .patch("/api/users/me/profile")
        .set("Authorization", `Bearer ${token}`)
        .field("fullName", "Phone Setter")
        .field("phone", phone);
      expect(set.status).toBe(200);
      expect(set.body.data.user.phone).toBe(phone);

      const listing = await prisma.listing.create({
        data: {
          sellerId: user.id,
          movieName: "Live Listing Movie",
          theaterName: "Live Listing Theater",
          theaterLat: 12.97,
          theaterLng: 77.59,
          showtime: new Date(Date.now() + 24 * 60 * 60 * 1000),
          bookingId: `LIVE${randomUUID()}`.slice(0, 20),
          totalSeats: 1,
          availableSeats: 1,
          pricePerSeat: 100,
        },
      });
      listingIds.push(listing.id);

      const clear = await request(app)
        .patch("/api/users/me/profile")
        .set("Authorization", `Bearer ${token}`)
        .field("fullName", "Phone Setter")
        .field("phone", "");
      expect(clear.status).toBe(400);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).phone).toBe(phone);
    });
  });

  describe("fraud report against a transaction (reported party derived server-side)", () => {
    async function setupTransaction() {
      const { user: seller, token: sellerToken } = await createUser({});
      const { user: buyer, token: buyerToken } = await createUser({ phone: null });
      const listing = await prisma.listing.create({
        data: {
          sellerId: seller.id,
          movieName: "Report Derive Movie",
          theaterName: "Report Derive Theater",
          theaterLat: 12.97,
          theaterLng: 77.59,
          showtime: new Date(Date.now() + 24 * 60 * 60 * 1000),
          bookingId: `RPTDRV${randomUUID()}`.slice(0, 20),
          totalSeats: 2,
          availableSeats: 1,
          pricePerSeat: 200,
        },
      });
      listingIds.push(listing.id);
      const txn = await prisma.transaction.create({
        data: { listingId: listing.id, buyerId: buyer.id, seatsCount: 1, amountPaid: 200, status: "RESERVED" },
      });
      return { seller, sellerToken, buyer, buyerToken, transactionId: txn.id };
    }

    it("buyer reporting by transaction alone reports the seller", async () => {
      const { seller, buyerToken, transactionId } = await setupTransaction();
      const res = await request(app)
        .post("/api/fraud-reports")
        .set("Authorization", `Bearer ${buyerToken}`)
        .field("relatedTransactionId", transactionId)
        .field("description", "No-show");
      expect(res.status).toBe(201);
      expect(res.body.data.report.reportedUserId).toBe(seller.id);
    });

    it("seller reporting by transaction alone reports the buyer, even with no phone on file", async () => {
      const { buyer, sellerToken, transactionId } = await setupTransaction();
      const res = await request(app)
        .post("/api/fraud-reports")
        .set("Authorization", `Bearer ${sellerToken}`)
        .field("relatedTransactionId", transactionId)
        .field("description", "Chargeback threat");
      expect(res.status).toBe(201);
      expect(res.body.data.report.reportedUserId).toBe(buyer.id);
    });

    it("rejects a client-supplied reportedUserId that isn't the other party", async () => {
      const { buyerToken, transactionId } = await setupTransaction();
      const { user: bystander } = await createUser({});
      const res = await request(app)
        .post("/api/fraud-reports")
        .set("Authorization", `Bearer ${buyerToken}`)
        .field("relatedTransactionId", transactionId)
        .field("reportedUserId", bystander.id)
        .field("description", "Trying to report someone else");
      expect(res.status).toBe(400);
      expect(await prisma.fraudReport.count({ where: { reportedUserId: bystander.id } })).toBe(0);
    });

    it("403s a reporter who isn't a party to the transaction", async () => {
      const { transactionId } = await setupTransaction();
      const { token: strangerToken } = await createUser({});
      const res = await request(app)
        .post("/api/fraud-reports")
        .set("Authorization", `Bearer ${strangerToken}`)
        .field("relatedTransactionId", transactionId)
        .field("description", "Not my transaction");
      expect(res.status).toBe(403);
    });
  });

  describe("admin lookup by email (GET /api/admin/users?email=)", () => {
    it("finds an exact match only, and needs exactly one of phone/email", async () => {
      const admin = await prisma.adminUser.create({
        data: { username: `login-support-${randomUUID()}`, passwordHash: "n/a", role: "SUPPORT" },
      });
      adminIds.push(admin.id);
      const adminToken = await issueAdminSessionToken(admin);
      const email = randomEmail("adminlookup");
      const { user } = await createUser({ email, verified: true });

      const exact = await request(app)
        .get("/api/admin/users")
        .query({ email })
        .set("Authorization", `Bearer ${adminToken}`);
      expect(exact.status).toBe(200);
      expect(exact.body.data.user.id).toBe(user.id);
      expect(exact.body.data.user.email).toBe(email);

      for (const near of [email.toUpperCase(), email.slice(0, -4), email.split("@")[0]]) {
        const res = await request(app)
          .get("/api/admin/users")
          .query({ email: near })
          .set("Authorization", `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.data.user).toBeNull();
      }

      const both = await request(app)
        .get("/api/admin/users")
        .query({ email, phone: user.phone })
        .set("Authorization", `Bearer ${adminToken}`);
      expect(both.status).toBe(400);

      const neither = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(neither.status).toBe(400);
    });
  });
});

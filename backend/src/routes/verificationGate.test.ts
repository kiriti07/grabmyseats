import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { issueSessionToken } from "../lib/session";

// The verification gate (lib/verificationGate.ts) on the three actions it
// guards - POST /api/listings, POST /api/listings/:id/reserve, GET
// /api/transactions/:id/contact - with REQUIRE_PHONE_VERIFICATION off and
// on. Each probe is built to fail *after* the gate (a body that fails
// validation, or an id that doesn't exist), so 403 means "stopped by the
// gate" and anything else means "let through", without needing real
// listings, uploads, or transactions.
describe("verification gate (REQUIRE_PHONE_VERIFICATION)", () => {
  const userIds: string[] = [];

  async function createUser(opts: { emailVerified: boolean; phoneVerified: boolean }) {
    const user = await prisma.user.create({
      data: {
        email: `gate-${randomUUID()}@example.com`,
        emailVerifiedAt: opts.emailVerified ? new Date() : null,
        phone: `+1555gate${randomUUID()}`.slice(0, 30),
        phoneVerifiedAt: opts.phoneVerified ? new Date() : null,
      },
    });
    userIds.push(user.id);
    return issueSessionToken(user);
  }

  // Status of each gated action for this session: 403 = gated.
  async function probe(token: string) {
    const auth = { Authorization: `Bearer ${token}` };
    const [list, reserve, contact] = await Promise.all([
      request(app).post("/api/listings").set(auth).field("movieName", ""),
      request(app).post(`/api/listings/${randomUUID()}/reserve`).set(auth).send({ seats: 1 }),
      request(app).get(`/api/transactions/${randomUUID()}/contact`).set(auth),
    ]);
    return { list: list.status, reserve: reserve.status, contact: contact.status };
  }

  function expectAllGated(statuses: Record<string, number>) {
    for (const status of Object.values(statuses)) expect(status).toBe(403);
  }

  function expectNoneGated(statuses: Record<string, number>) {
    for (const status of Object.values(statuses)) expect(status).not.toBe(403);
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  describe("flag off (default)", () => {
    it("an unverified email is gated on all three actions, whatever the phone", async () => {
      expectAllGated(await probe(await createUser({ emailVerified: false, phoneVerified: true })));
    });

    it("a verified email is enough - an unverified phone doesn't matter", async () => {
      vi.stubEnv("REQUIRE_PHONE_VERIFICATION", "false");
      expectNoneGated(await probe(await createUser({ emailVerified: true, phoneVerified: false })));
    });

    it("the 403 says what to verify", async () => {
      const token = await createUser({ emailVerified: false, phoneVerified: false });
      const res = await request(app)
        .get(`/api/transactions/${randomUUID()}/contact`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.body.error).toBe("Verify your email to continue");
    });
  });

  describe("flag on", () => {
    it("a verified email alone is gated on all three actions", async () => {
      vi.stubEnv("REQUIRE_PHONE_VERIFICATION", "true");
      const token = await createUser({ emailVerified: true, phoneVerified: false });
      expectAllGated(await probe(token));

      const res = await request(app)
        .get(`/api/transactions/${randomUUID()}/contact`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.body.error).toBe("Verify your phone number to continue");
    });

    it("verified email + verified phone passes", async () => {
      vi.stubEnv("REQUIRE_PHONE_VERIFICATION", "true");
      expectNoneGated(await probe(await createUser({ emailVerified: true, phoneVerified: true })));
    });

    it("a verified phone never stands in for the email", async () => {
      vi.stubEnv("REQUIRE_PHONE_VERIFICATION", "true");
      const token = await createUser({ emailVerified: false, phoneVerified: true });
      expectAllGated(await probe(token));
    });

    it("is reported by GET /api/auth/options, and flips back when unset", async () => {
      vi.stubEnv("REQUIRE_PHONE_VERIFICATION", "true");
      expect((await request(app).get("/api/auth/options")).body.data.requirePhoneVerification).toBe(
        true,
      );
      vi.stubEnv("REQUIRE_PHONE_VERIFICATION", "");
      expect((await request(app).get("/api/auth/options")).body.data.requirePhoneVerification).toBe(
        false,
      );
    });
  });
});

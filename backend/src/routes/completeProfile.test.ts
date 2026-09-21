import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { issueOtp } from "../lib/otpStore";
import { issueSessionToken } from "../lib/session";

// End-to-end coverage for the "complete your profile" onboarding step,
// against the real local Postgres through the actual Express app - not
// mocked: POST /api/auth/otp/verify's isNewAccount flag (what the frontend
// uses to route a brand-new signup through /login/welcome, and skip it
// entirely for a returning login) and POST /api/auth/complete-profile
// itself (the one-time step that flag gates).
describe("complete-profile onboarding step", () => {
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  // POST /api/auth/otp/verify's PHONE_RE is digits-only - see
  // suspension.test.ts's sellerPhone/referrals.test.ts's randomDigitPhone
  // for the same convention.
  function randomDigitPhone(): string {
    return `+1${Math.floor(1_000_000_000 + Math.random() * 9_000_000_000)}`;
  }

  async function verifyOtp(phone: string) {
    const code = await issueOtp(phone);
    const res = await request(app).post("/api/auth/otp/verify").send({ phone, code });
    expect(res.status).toBe(200);
    userIds.push(res.body.data.user.id);
    return res.body.data as { user: { id: string; name: string | null }; token: string; isNewAccount: boolean };
  }

  it("reports isNewAccount: true for a brand-new signup", async () => {
    const { isNewAccount, user } = await verifyOtp(randomDigitPhone());
    expect(isNewAccount).toBe(true);
    expect(user.name).toBeNull();
  });

  it("reports isNewAccount: false for a returning login on the same phone", async () => {
    const phone = randomDigitPhone();
    const first = await verifyOtp(phone);
    expect(first.isNewAccount).toBe(true);

    const second = await verifyOtp(phone);
    expect(second.isNewAccount).toBe(false);
    expect(second.user.id).toBe(first.user.id);
  });

  it("POST /api/auth/complete-profile requires authentication", async () => {
    const res = await request(app)
      .post("/api/auth/complete-profile")
      .send({ name: "No Token" });
    expect(res.status).toBe(401);
  });

  it("requires a non-empty name, but email is optional", async () => {
    const { token } = await verifyOtp(randomDigitPhone());

    const missingName = await request(app)
      .post("/api/auth/complete-profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "   " });
    expect(missingName.status).toBe(400);

    const invalidEmail = await request(app)
      .post("/api/auth/complete-profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Priya Sharma", email: "not-an-email" });
    expect(invalidEmail.status).toBe(400);

    const nameOnly = await request(app)
      .post("/api/auth/complete-profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Priya Sharma" });
    expect(nameOnly.status).toBe(200);
    expect(nameOnly.body.data.user.name).toBe("Priya Sharma");
    expect(nameOnly.body.data.user.email).toBeNull();
  });

  it("sets both name and email when both are provided", async () => {
    const { token } = await verifyOtp(randomDigitPhone());
    const res = await request(app)
      .post("/api/auth/complete-profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Arjun Mehta", email: `arjun${Date.now()}@example.com` });
    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe("Arjun Mehta");
    expect(res.body.data.user.email).toContain("arjun");
  });

  it("cannot be called a second time once a name is already on file - not skippable, not reusable as a profile editor", async () => {
    const { token } = await verifyOtp(randomDigitPhone());

    const first = await request(app)
      .post("/api/auth/complete-profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "First Name" });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/api/auth/complete-profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Trying To Change It" });
    expect(second.status).toBe(409);

    const stillFirstName = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(stillFirstName.body.data.user.name).toBe("First Name");
  });

  it("an existing (already-named) account can never call complete-profile, even right after a fresh login", async () => {
    const phone = randomDigitPhone();
    const { token: firstToken } = await verifyOtp(phone);
    const completed = await request(app)
      .post("/api/auth/complete-profile")
      .set("Authorization", `Bearer ${firstToken}`)
      .send({ name: "Already Named" });
    expect(completed.status).toBe(200);

    // A later, separate login on the same phone (isNewAccount: false this
    // time) still can't reach complete-profile - the gate is "already has
    // a name", not "was this the same HTTP request that created them".
    const { token: secondToken, isNewAccount } = await verifyOtp(phone);
    expect(isNewAccount).toBe(false);

    const res = await request(app)
      .post("/api/auth/complete-profile")
      .set("Authorization", `Bearer ${secondToken}`)
      .send({ name: "Sneaky Rename" });
    expect(res.status).toBe(409);
  });

  it("rejects an email already used by another account", async () => {
    const email = `taken${Date.now()}@example.com`;
    const { token: firstToken } = await verifyOtp(randomDigitPhone());
    const first = await request(app)
      .post("/api/auth/complete-profile")
      .set("Authorization", `Bearer ${firstToken}`)
      .send({ name: "First User", email });
    expect(first.status).toBe(200);

    const { token: secondToken } = await verifyOtp(randomDigitPhone());
    const second = await request(app)
      .post("/api/auth/complete-profile")
      .set("Authorization", `Bearer ${secondToken}`)
      .send({ name: "Second User", email });
    expect(second.status).toBe(409);
  });
});

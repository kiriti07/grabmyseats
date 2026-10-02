import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { issueSessionToken } from "../lib/session";
import { issueEmailVerificationToken } from "../lib/emailVerificationStore";

// End-to-end coverage for the email-verification flow (POST
// /api/users/me/email/send-verification, GET /api/users/me/email/verify,
// and the derived User.isVerified) against the real local Postgres +
// Redis through the actual Express app - not mocked. Mirrors
// profile.test.ts's style.
describe("email verification", () => {
  let userId: string;
  let userToken: string;
  let noEmailUserId: string;
  let noEmailUserToken: string;

  beforeAll(async () => {
    const suffix = randomUUID();
    const user = await prisma.user.create({
      data: { phone: `+1555verify${suffix}`.slice(0, 30), email: `verify-${suffix}@example.com` },
    });
    const noEmailUser = await prisma.user.create({
      data: { phone: `+1555noemail${suffix}`.slice(0, 30) },
    });
    userId = user.id;
    userToken = await issueSessionToken(user);
    noEmailUserId = noEmailUser.id;
    noEmailUserToken = await issueSessionToken(noEmailUser);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, noEmailUserId] } } });
  });

  it("shows no badge (isVerified: false) for a user with an unverified email", async () => {
    const res = await request(app)
      .get("/api/users/me/profile")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBeTruthy();
    expect(res.body.data.user.isVerified).toBe(false);
  });

  it("a user with no email set never shows as verified, even if emailVerifiedAt were set", async () => {
    // Bypasses the app entirely (direct DB write) to simulate the
    // otherwise-unreachable state of emailVerifiedAt being set without an
    // email on file - isUserVerified (lib/serialize.ts) must still treat
    // this as unverified.
    await prisma.user.update({
      where: { id: noEmailUserId },
      data: { emailVerifiedAt: new Date() },
    });

    const res = await request(app)
      .get("/api/users/me/profile")
      .set("Authorization", `Bearer ${noEmailUserToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBeNull();
    expect(res.body.data.user.isVerified).toBe(false);

    // Reset for the other tests in this file.
    await prisma.user.update({
      where: { id: noEmailUserId },
      data: { emailVerifiedAt: null },
    });
  });

  it("POST send-verification 400s with no email on file", async () => {
    const res = await request(app)
      .post("/api/users/me/email/send-verification")
      .set("Authorization", `Bearer ${noEmailUserToken}`);
    expect(res.status).toBe(400);
  });

  it("POST send-verification requires auth", async () => {
    const res = await request(app).post("/api/users/me/email/send-verification");
    expect(res.status).toBe(401);
  });

  it("GET verify flips isVerified to true for a valid token", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const token = await issueEmailVerificationToken(user.id, user.email!);

    const res = await request(app).get(`/api/users/me/email/verify?token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.isVerified).toBe(true);

    const profile = await request(app)
      .get("/api/users/me/profile")
      .set("Authorization", `Bearer ${userToken}`);
    expect(profile.body.data.user.isVerified).toBe(true);
  });

  it("rejects a reused token", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const token = await issueEmailVerificationToken(user.id, user.email!);

    const first = await request(app).get(`/api/users/me/email/verify?token=${token}`);
    expect(first.status).toBe(200);

    const second = await request(app).get(`/api/users/me/email/verify?token=${token}`);
    expect(second.status).toBe(401);
  });

  it("rejects an unknown/expired token", async () => {
    const res = await request(app).get(`/api/users/me/email/verify?token=${randomUUID()}`);
    expect(res.status).toBe(401);
  });

  it("POST send-verification 409s once already verified", async () => {
    const res = await request(app)
      .post("/api/users/me/email/send-verification")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(409);
  });

  it("changing email via PATCH /me/profile clears verification", async () => {
    // userId is verified from the earlier test in this file.
    const res = await request(app)
      .patch("/api/users/me/profile")
      .set("Authorization", `Bearer ${userToken}`)
      .field("fullName", "Verified Then Changed")
      .field("email", `changed-${randomUUID()}@example.com`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.isVerified).toBe(false);
  });

  it("a token issued for a since-changed email is rejected", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    // Token bound to the *old* email, not whatever's on file now.
    const staleToken = await issueEmailVerificationToken(user.id, "stale-old-address@example.com");

    const res = await request(app).get(`/api/users/me/email/verify?token=${staleToken}`);
    expect(res.status).toBe(401);
  });
});

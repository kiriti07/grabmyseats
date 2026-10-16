import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { issueSessionToken } from "../lib/session";
import { MAX_TOKENS_PER_USER } from "./pushTokens";

// routes/pushTokens.ts: registering and removing this device's push token.
// Tokens here are made-up strings - never real FCM tokens.
describe("push tokens", () => {
  const userIds: string[] = [];
  const fakeToken = () => `fake-token-${randomUUID()}`;
  let a: { id: string; auth: Record<string, string> };
  let b: { id: string; auth: Record<string, string> };

  async function user() {
    const u = await prisma.user.create({ data: { email: `pt-${randomUUID()}@example.com`, emailVerifiedAt: new Date() } });
    userIds.push(u.id);
    return { id: u.id, auth: { Authorization: `Bearer ${await issueSessionToken(u)}` } };
  }
  const register = (auth: Record<string, string>, token: string, platform = "android") =>
    request(app).post("/api/push/tokens").set(auth).send({ token, platform });
  const remove = (auth: Record<string, string>, token: string) =>
    request(app).delete("/api/push/tokens").set(auth).send({ token });

  beforeAll(async () => {
    a = await user();
    b = await user();
  });

  afterAll(async () => {
    await prisma.pushToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("needs a session", async () => {
    expect((await request(app).post("/api/push/tokens").send({ token: fakeToken(), platform: "android" })).status).toBe(401);
    expect((await request(app).delete("/api/push/tokens").send({ token: fakeToken() })).status).toBe(401);
  });

  it("refuses a malformed token or another platform", async () => {
    expect((await register(a.auth, "short")).status).toBe(400);
    expect((await register(a.auth, "bad token with spaces and <html>")).status).toBe(400);
    expect((await register(a.auth, fakeToken(), "ios")).status).toBe(400);
  });

  it("registers a device, and re-registering just refreshes it", async () => {
    const token = fakeToken();
    expect((await register(a.auth, token)).status).toBe(200);
    const first = await prisma.pushToken.findUniqueOrThrow({ where: { token } });
    await register(a.auth, token);
    const again = await prisma.pushToken.findUniqueOrThrow({ where: { token } });
    expect(again.id).toBe(first.id);
    expect(again.lastSeenAt.getTime()).toBeGreaterThanOrEqual(first.lastSeenAt.getTime());
  });

  it("several devices per account; a device signing into another account moves to it", async () => {
    const phone1 = fakeToken();
    const phone2 = fakeToken();
    await register(a.auth, phone1);
    await register(a.auth, phone2);
    expect(await prisma.pushToken.count({ where: { userId: a.id, token: { in: [phone1, phone2] } } })).toBe(2);

    await register(b.auth, phone2);
    expect((await prisma.pushToken.findUniqueOrThrow({ where: { token: phone2 } })).userId).toBe(b.id);
  });

  it(`keeps the latest ${MAX_TOKENS_PER_USER} devices per account`, async () => {
    const u = await user();
    const tokens: string[] = [];
    for (let i = 0; i < MAX_TOKENS_PER_USER + 2; i++) {
      tokens.push(fakeToken());
      await register(u.auth, tokens[i]);
    }
    const kept = (await prisma.pushToken.findMany({ where: { userId: u.id }, select: { token: true } })).map((t) => t.token);
    expect(kept).toHaveLength(MAX_TOKENS_PER_USER);
    expect(kept).not.toContain(tokens[0]);
    expect(kept).toContain(tokens[tokens.length - 1]);
  });

  it("sign-out removes only the caller's own token", async () => {
    const mine = fakeToken();
    const theirs = fakeToken();
    await register(a.auth, mine);
    await register(b.auth, theirs);
    expect((await remove(a.auth, theirs)).status).toBe(200);
    expect(await prisma.pushToken.count({ where: { token: theirs } })).toBe(1);
    await remove(a.auth, mine);
    expect(await prisma.pushToken.count({ where: { token: mine } })).toBe(0);
  });
});

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../app";
import { redis } from "../lib/redis";
import { emailProvider } from "../lib/email";

// trust proxy = 1 (app.ts): behind Caddy, per-IP rate limits key on the
// client IP Caddy appends to X-Forwarded-For, not on the socket (Caddy).
// Exercised through the real per-IP OTP limit (otpIpLimiter: 10 requests
// per IP per hour on POST /api/auth/otp/request); every request uses a
// fresh email so only the per-IP limit is in play. Mail is mocked.
describe("trust proxy (one hop: Caddy)", () => {
  const IP_LIMIT = 10;

  function testIp(): string {
    const octet = () => Math.floor(Math.random() * 254) + 1;
    return `203.0.${octet()}.${octet()}`;
  }

  function otpRequest(forwardedFor?: string) {
    const req = request(app).post("/api/auth/otp/request");
    if (forwardedFor !== undefined) req.set("X-Forwarded-For", forwardedFor);
    return req.send({ email: `proxy-${randomUUID()}@example.com` });
  }

  async function exhaust(forwardedFor?: string) {
    for (let i = 0; i < IP_LIMIT; i++) expect((await otpRequest(forwardedFor)).status).toBe(200);
  }

  async function deleteKeys(pattern: string) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  }

  // The limiter's keys for an IPv4 / IPv6 loopback client (express-rate-limit
  // groups IPv6 addresses by /56).
  async function clearLoopbackBuckets() {
    await redis.del("rl:otp-ip:127.0.0.1", "rl:otp-ip:::/56");
  }

  beforeEach(async () => {
    vi.spyOn(emailProvider, "send").mockResolvedValue(undefined);
    await deleteKeys("rl:otp-global:*");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is configured to trust exactly one hop", () => {
    expect(app.get("trust proxy")).toBe(1);
  });

  it("gives each forwarded client IP its own budget", async () => {
    const [a, b] = [testIp(), testIp()];
    await exhaust(a);
    expect((await otpRequest(a)).status).toBe(429);
    // Same socket (the "proxy"), different client - unaffected.
    expect((await otpRequest(b)).status).toBe(200);
  });

  it("uses only the entry the proxy appended - a client can't dodge the limit by prepending a fake IP", async () => {
    const real = testIp();
    await exhaust(real);
    // What Caddy forwards when the client itself sent "X-Forwarded-For: <fake>".
    const fake = `198.51.100.${Math.floor(Math.random() * 254) + 1}`;
    expect((await otpRequest(`${fake}, ${real}`)).status).toBe(429);
  });

  it("without a proxy (local development, no header) works and limits by the socket address", async () => {
    // supertest connects over loopback; nothing else in the suite sends
    // un-forwarded requests to this endpoint, so this bucket is ours.
    await clearLoopbackBuckets();
    try {
      await exhaust();
      expect((await otpRequest()).status).toBe(429);
      // A forwarded client is still independent of the local socket's bucket.
      expect((await otpRequest(testIp())).status).toBe(200);
    } finally {
      // The test Redis is the local development one: leaving the loopback
      // client's bucket exhausted would lock local OTP requests out for an hour.
      await clearLoopbackBuckets();
    }
  });
});

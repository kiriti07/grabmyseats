import { rateLimit, ipKeyGenerator, MINUTE, HOUR, DAY } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import type { Request, Response } from "express";
import type { ApiResponse } from "@grabmyseats/shared";
import { redis } from "../lib/redis";
import { emailRateLimitKey, normalizeLoginEmail } from "../lib/validators";

function sendCommand(...args: string[]) {
  const [command, ...rest] = args;
  return redis.call(command, rest) as Promise<
    string | number | boolean | (string | number | boolean)[]
  >;
}

// Max 3 OTP requests per phone number per 10 minutes.
export const otpPhoneLimiter = rateLimit({
  windowMs: 10 * MINUTE,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand,
    prefix: "rl:otp-phone:",
  }),
  keyGenerator: (req) => {
    const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
    return phone || ipKeyGenerator(req.ip ?? "unknown");
  },
  handler: (_req, res) => {
    const body: ApiResponse<never> = {
      success: false,
      error: "Too many OTP requests for this phone number. Please try again in a few minutes.",
    };
    res.status(429).json(body);
  },
});

// Email OTP limits (POST /api/auth/otp/request, POST
// /api/users/me/email/claim/request). Every one of these sends mail from
// our domain to an address the caller chose, so they're layered: per
// inbox (short and daily windows), per IP (otpIpLimiter below), and a
// global ceiling. All share one 429 message that never says anything about
// whether an account exists for the address.
function sendOtpRateLimited(_req: Request, res: Response): void {
  const body: ApiResponse<never> = {
    success: false,
    error: "Too many requests. Please try again later.",
  };
  res.status(429).json(body);
}

// Keyed on the "+tag"-stripped address (see emailRateLimitKey), so plus
// aliases of one inbox share a budget. Invalid emails fall back to the IP -
// the route 400s them anyway, but they still count.
function emailKey(req: Request): string {
  const email = normalizeLoginEmail(req.body?.email);
  return email ? emailRateLimitKey(email) : ipKeyGenerator(req.ip ?? "unknown");
}

// Max 3 email OTPs per inbox per 10 minutes, and 10 per day - the daily
// cap stops a slow drip at one victim that stays under the short window.
export const otpEmailLimiter = rateLimit({
  windowMs: 10 * MINUTE,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({ sendCommand, prefix: "rl:otp-email:" }),
  keyGenerator: emailKey,
  handler: sendOtpRateLimited,
});

export const otpEmailDailyLimiter = rateLimit({
  windowMs: DAY,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({ sendCommand, prefix: "rl:otp-email-day:" }),
  keyGenerator: emailKey,
  handler: sendOtpRateLimited,
});

// Circuit breaker across all callers: no more than 300 OTP emails an hour
// in total, however many IPs/addresses they're spread over. Well above
// normal sign-in volume; hitting it means something is abusing the
// endpoint, and the right failure is "nobody gets mail for a bit", not
// "we keep sending".
export const otpGlobalLimiter = rateLimit({
  windowMs: HOUR,
  limit: 300,
  standardHeaders: false,
  legacyHeaders: false,
  store: new RedisStore({ sendCommand, prefix: "rl:otp-global:" }),
  keyGenerator: () => "all",
  handler: sendOtpRateLimited,
});

// Max 10 OTP requests per IP per hour.
export const otpIpLimiter = rateLimit({
  windowMs: HOUR,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand,
    prefix: "rl:otp-ip:",
  }),
  handler: (_req, res) => {
    const body: ApiResponse<never> = {
      success: false,
      error: "Too many OTP requests from this network. Please try again later.",
    };
    res.status(429).json(body);
  },
});

// Max 5 admin login attempts per username per 15 minutes - a
// password-based login (unlike customer OTP) is directly brute-forceable,
// and this endpoint guards accounts that can suspend users and issue
// refunds.
export const adminLoginLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand,
    prefix: "rl:admin-login:",
  }),
  keyGenerator: (req) => {
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    return username || ipKeyGenerator(req.ip ?? "unknown");
  },
  handler: (_req, res) => {
    const body: ApiResponse<never> = {
      success: false,
      error: "Too many login attempts. Please try again in a few minutes.",
    };
    res.status(429).json(body);
  },
});

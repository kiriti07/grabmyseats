import { rateLimit, ipKeyGenerator, MINUTE, HOUR, DAY } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import type { Request, Response } from "express";
import type { ApiResponse } from "@grabmyseats/shared";
import { redis } from "../lib/redis";
import { emailRateLimitKey, parseIdentifierInput } from "../lib/validators";

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

// OTP limits (POST /api/auth/otp/request, POST
// /api/users/me/identifiers/claim/request). Every one of these sends an
// email or SMS from us to an address/number the caller chose, so they're
// layered: per identifier (short and daily windows), per IP (otpIpLimiter
// below), and a global ceiling per channel. All share one 429 message that
// never says anything about whether an account exists.
function sendOtpRateLimited(_req: Request, res: Response): void {
  const body: ApiResponse<never> = {
    success: false,
    error: "Too many requests. Please try again later.",
  };
  res.status(429).json(body);
}

// Emails key on the "+tag"-stripped address (see emailRateLimitKey), so
// plus aliases of one inbox share a budget; phones on their E.164 form.
// The per-identifier limiters skip invalid input entirely (the route 400s
// it, and the per-IP limiter still counts it) - keying it on the IP here
// would let a few typos lock a whole network out of every identifier.
function identifierKey(req: Request): string {
  const input = parseIdentifierInput(req.body);
  if (!input) return `ip:${ipKeyGenerator(req.ip ?? "unknown")}`;
  return input.channel === "email"
    ? `email:${emailRateLimitKey(input.value)}`
    : `phone:${input.value}`;
}

function hasNoIdentifier(req: Request): boolean {
  return parseIdentifierInput(req.body) === null;
}

// Max 3 OTPs per identifier per 10 minutes, and 10 per day - the daily
// cap stops a slow drip at one victim that stays under the short window.
export const otpIdentifierLimiter = rateLimit({
  windowMs: 10 * MINUTE,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({ sendCommand, prefix: "rl:otp-id:" }),
  keyGenerator: identifierKey,
  skip: hasNoIdentifier,
  handler: sendOtpRateLimited,
});

export const otpIdentifierDailyLimiter = rateLimit({
  windowMs: DAY,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({ sendCommand, prefix: "rl:otp-id-day:" }),
  keyGenerator: identifierKey,
  skip: hasNoIdentifier,
  handler: sendOtpRateLimited,
});

// Circuit breaker across all callers, per channel: no more than 300 OTP
// emails or 100 OTP SMS an hour in total, however many IPs/identifiers
// they're spread over. SMS is lower because every one costs money. Well
// above normal sign-in volume; hitting it means something is abusing the
// endpoint, and the right failure is "nobody gets a code for a bit", not
// "we keep sending".
export const otpGlobalLimiter = rateLimit({
  windowMs: HOUR,
  limit: (req) => (parseIdentifierInput(req.body)?.channel === "phone" ? 100 : 300),
  standardHeaders: false,
  legacyHeaders: false,
  store: new RedisStore({ sendCommand, prefix: "rl:otp-global:" }),
  keyGenerator: (req) => parseIdentifierInput(req.body)?.channel ?? "email",
  handler: sendOtpRateLimited,
});

// Max 10 code *checks* per identifier per hour (POST /api/auth/otp/verify,
// POST /api/users/me/identifiers/claim/verify). A normal code dies on its
// first wrong guess anyway, but the Play reviewer code (REVIEW_OTP - see
// lib/reviewAccess.ts) is fixed, so without this its 1,000,000 possible
// values could simply be tried in turn.
export const otpVerifyLimiter = rateLimit({
  windowMs: HOUR,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({ sendCommand, prefix: "rl:otp-verify:" }),
  keyGenerator: identifierKey,
  skip: hasNoIdentifier,
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

// Max 20 venue lookups (POST /api/listings/geocode) per user per 10
// minutes. Each one can spend a shared, 1-request-per-second OpenStreetMap
// Nominatim slot (lib/geocode.ts), so one account mustn't be able to drain
// it for everyone. Mount after requireAuth.
export const geocodeLimiter = rateLimit({
  windowMs: 10 * MINUTE,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({ sendCommand, prefix: "rl:geocode:" }),
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? "unknown"),
  handler: (_req, res) => {
    const body: ApiResponse<never> = {
      success: false,
      error: "Too many venue lookups. Place the pin on the map instead, or try again shortly.",
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

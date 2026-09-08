"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminLoginLimiter = exports.otpIpLimiter = exports.otpPhoneLimiter = void 0;
const express_rate_limit_1 = require("express-rate-limit");
const rate_limit_redis_1 = require("rate-limit-redis");
const redis_1 = require("../lib/redis");
function sendCommand(...args) {
    const [command, ...rest] = args;
    return redis_1.redis.call(command, rest);
}
// Max 3 OTP requests per phone number per 10 minutes.
exports.otpPhoneLimiter = (0, express_rate_limit_1.rateLimit)({
    windowMs: 10 * express_rate_limit_1.MINUTE,
    limit: 3,
    standardHeaders: true,
    legacyHeaders: false,
    store: new rate_limit_redis_1.RedisStore({
        sendCommand,
        prefix: "rl:otp-phone:",
    }),
    keyGenerator: (req) => {
        const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
        return phone || (0, express_rate_limit_1.ipKeyGenerator)(req.ip ?? "unknown");
    },
    handler: (_req, res) => {
        const body = {
            success: false,
            error: "Too many OTP requests for this phone number. Please try again in a few minutes.",
        };
        res.status(429).json(body);
    },
});
// Max 10 OTP requests per IP per hour.
exports.otpIpLimiter = (0, express_rate_limit_1.rateLimit)({
    windowMs: express_rate_limit_1.HOUR,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    store: new rate_limit_redis_1.RedisStore({
        sendCommand,
        prefix: "rl:otp-ip:",
    }),
    handler: (_req, res) => {
        const body = {
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
exports.adminLoginLimiter = (0, express_rate_limit_1.rateLimit)({
    windowMs: 15 * express_rate_limit_1.MINUTE,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    store: new rate_limit_redis_1.RedisStore({
        sendCommand,
        prefix: "rl:admin-login:",
    }),
    keyGenerator: (req) => {
        const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
        return username || (0, express_rate_limit_1.ipKeyGenerator)(req.ip ?? "unknown");
    },
    handler: (_req, res) => {
        const body = {
            success: false,
            error: "Too many login attempts. Please try again in a few minutes.",
        };
        res.status(429).json(body);
    },
});
//# sourceMappingURL=rateLimit.js.map
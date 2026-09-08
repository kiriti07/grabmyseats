"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.issueOtp = issueOtp;
exports.verifyOtp = verifyOtp;
const redis_1 = require("./redis");
const OTP_TTL_SECONDS = 5 * 60;
const OTP_LENGTH = 6;
function otpKey(phone) {
    return `otp:${phone}`;
}
function generateCode() {
    const max = 10 ** OTP_LENGTH;
    return Math.floor(Math.random() * max)
        .toString()
        .padStart(OTP_LENGTH, "0");
}
async function issueOtp(phone) {
    const code = generateCode();
    await redis_1.redis.set(otpKey(phone), code, "EX", OTP_TTL_SECONDS);
    return code;
}
async function verifyOtp(phone, code) {
    const key = otpKey(phone);
    const stored = await redis_1.redis.get(key);
    if (stored === null)
        return false;
    // Always consume the attempt so a code can't be reused or brute-forced.
    await redis_1.redis.del(key);
    return stored === code;
}
//# sourceMappingURL=otpStore.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_MAX_AGE_SECONDS = exports.SESSION_COOKIE_NAME = void 0;
exports.getAuthSecret = getAuthSecret;
// Matches Auth.js's own defaults so tokens issued here are structurally
// identical to what @auth/core would issue via its normal sign-in flow.
// See: @auth/core/lib/actions/callback/index.js (salt = cookie name).
exports.SESSION_COOKIE_NAME = "authjs.session-token";
exports.SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days
function getAuthSecret() {
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
        throw new Error("AUTH_SECRET environment variable is not set");
    }
    return secret;
}
//# sourceMappingURL=authConfig.js.map
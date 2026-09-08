"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.issueSessionToken = issueSessionToken;
exports.decodeSessionToken = decodeSessionToken;
exports.getSessionFromRequest = getSessionFromRequest;
const jwt_1 = require("@auth/core/jwt");
const authConfig_1 = require("./authConfig");
async function issueSessionToken(user) {
    return (0, jwt_1.encode)({
        secret: (0, authConfig_1.getAuthSecret)(),
        salt: authConfig_1.SESSION_COOKIE_NAME,
        maxAge: authConfig_1.SESSION_MAX_AGE_SECONDS,
        token: { sub: user.id, phone: user.phone, name: user.name },
    });
}
async function decodeSessionToken(token) {
    const payload = await (0, jwt_1.decode)({
        secret: (0, authConfig_1.getAuthSecret)(),
        salt: authConfig_1.SESSION_COOKIE_NAME,
        token,
    });
    return payload;
}
// Reads the session token from either the Auth.js cookie or an
// `Authorization: Bearer` header, matching Auth.js's own lookup order.
async function getSessionFromRequest(req) {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === "string")
            headers.append(key, value);
        else if (Array.isArray(value)) {
            for (const v of value)
                headers.append(key, v);
        }
    }
    const token = await (0, jwt_1.getToken)({
        req: { headers },
        secret: (0, authConfig_1.getAuthSecret)(),
        salt: authConfig_1.SESSION_COOKIE_NAME,
        cookieName: authConfig_1.SESSION_COOKIE_NAME,
    });
    return token;
}
//# sourceMappingURL=session.js.map
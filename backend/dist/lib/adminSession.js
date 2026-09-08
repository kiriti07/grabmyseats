"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.issueAdminSessionToken = issueAdminSessionToken;
exports.decodeAdminSessionToken = decodeAdminSessionToken;
exports.getAdminSessionFromRequest = getAdminSessionFromRequest;
const jwt_1 = require("@auth/core/jwt");
const adminAuthConfig_1 = require("./adminAuthConfig");
// Same @auth/core JWT encode/decode mechanism as lib/session.ts (the
// customer session), but with its own secret and salt/cookie name - see
// adminAuthConfig.ts for why that separation matters.
async function issueAdminSessionToken(admin) {
    return (0, jwt_1.encode)({
        secret: (0, adminAuthConfig_1.getAdminAuthSecret)(),
        salt: adminAuthConfig_1.ADMIN_SESSION_COOKIE_NAME,
        maxAge: adminAuthConfig_1.ADMIN_SESSION_MAX_AGE_SECONDS,
        token: { sub: admin.id, username: admin.username, role: admin.role },
    });
}
async function decodeAdminSessionToken(token) {
    return (0, jwt_1.decode)({
        secret: (0, adminAuthConfig_1.getAdminAuthSecret)(),
        salt: adminAuthConfig_1.ADMIN_SESSION_COOKIE_NAME,
        token,
    });
}
// Reads the admin session token from either the admin_session cookie or an
// `Authorization: Bearer` header - same lookup order as
// getSessionFromRequest (lib/session.ts), just against the admin
// secret/cookie name so a customer bearer token can never decode here.
async function getAdminSessionFromRequest(req) {
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
        secret: (0, adminAuthConfig_1.getAdminAuthSecret)(),
        salt: adminAuthConfig_1.ADMIN_SESSION_COOKIE_NAME,
        cookieName: adminAuthConfig_1.ADMIN_SESSION_COOKIE_NAME,
    });
    return token;
}
//# sourceMappingURL=adminSession.js.map
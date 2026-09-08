"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachUser = attachUser;
exports.requireAuth = requireAuth;
exports.requireAdmin = requireAdmin;
const session_1 = require("../lib/session");
const prisma_1 = require("../lib/prisma");
// Attaches `req.user` when a valid Auth.js session token is present
// (cookie or `Authorization: Bearer`). Never blocks the request -
// use `requireAuth` on routes that must be authenticated.
async function attachUser(req, _res, next) {
    try {
        const session = await (0, session_1.getSessionFromRequest)(req);
        if (session?.sub) {
            const user = await prisma_1.prisma.user.findUnique({ where: { id: session.sub } });
            if (user)
                req.user = user;
        }
    }
    catch {
        // Malformed/expired token: proceed unauthenticated.
    }
    next();
}
function requireAuth(req, res, next) {
    if (!req.user) {
        res.status(401).json({ success: false, error: "Authentication required" });
        return;
    }
    // Rejected here (not a generic 401) so every authenticated route gets
    // this for free - suspension is set by POST /api/admin/users/:id/suspend
    // or POST /api/admin/fraud-reports/:id/resolve. The equivalent check at
    // login itself (POST /api/auth/otp/verify, which never reaches this
    // middleware) is separate - see that route.
    if (req.user.suspendedAt) {
        res.status(403).json({
            success: false,
            error: req.user.suspensionReason
                ? `Your account has been suspended: ${req.user.suspensionReason}`
                : "Your account has been suspended.",
        });
        return;
    }
    next();
}
// Mount after requireAuth - relies on req.user already being set.
function requireAdmin(req, res, next) {
    if (!req.user?.isAdmin) {
        res.status(403).json({ success: false, error: "Admin access required" });
        return;
    }
    next();
}
//# sourceMappingURL=auth.js.map
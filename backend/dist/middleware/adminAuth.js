"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachAdminUser = attachAdminUser;
exports.requireAdminAuth = requireAdminAuth;
exports.requireRole = requireRole;
const adminSession_1 = require("../lib/adminSession");
const prisma_1 = require("../lib/prisma");
// Attaches `req.adminUser` when a valid admin session is present (cookie
// or `Authorization: Bearer`) AND the account is still active - unlike
// customer suspension (checked separately in requireAuth), a deactivated
// AdminUser is treated as if it were never authenticated at all, since
// PATCH /api/admin/staff/:id's whole point is immediate revocation.
// Never blocks the request itself - use requireAdminAuth for that.
async function attachAdminUser(req, _res, next) {
    try {
        const session = await (0, adminSession_1.getAdminSessionFromRequest)(req);
        if (session?.sub) {
            const admin = await prisma_1.prisma.adminUser.findUnique({ where: { id: session.sub } });
            if (admin && admin.isActive)
                req.adminUser = admin;
        }
    }
    catch {
        // Malformed/expired token: proceed unauthenticated.
    }
    next();
}
function requireAdminAuth(req, res, next) {
    if (!req.adminUser) {
        res.status(401).json({ success: false, error: "Admin authentication required" });
        return;
    }
    next();
}
// Mount after requireAdminAuth - relies on req.adminUser already being set.
function requireRole(roles) {
    return (req, res, next) => {
        if (!req.adminUser || !roles.includes(req.adminUser.role)) {
            res.status(403).json({ success: false, error: "You don't have access to this action" });
            return;
        }
        next();
    };
}
//# sourceMappingURL=adminAuth.js.map
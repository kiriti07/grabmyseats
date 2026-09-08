"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminStaffRouter = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const serialize_1 = require("../lib/serialize");
const adminAuth_1 = require("../middleware/adminAuth");
const generateTempPassword_1 = require("../lib/generateTempPassword");
exports.adminStaffRouter = (0, express_1.Router)();
const BCRYPT_ROUNDS = 12;
const ADMIN_ROLES = ["ADMIN", "SUPPORT"];
class StaffNotFoundError extends Error {
}
// Creates a new AdminUser with a generated temporary password, handed back
// once in the response for the creating ADMIN to relay securely (Slack DM,
// in person) - this is the only public-facing way any AdminUser ever gets
// created besides the one-off backend/scripts/seedAdmin.ts. No "set your
// own password" flow exists yet, so the temp password IS the login
// password until someone builds one - out of scope for this pass.
exports.adminStaffRouter.post("/staff", adminAuth_1.requireAdminAuth, (0, adminAuth_1.requireRole)(["ADMIN"]), async (req, res) => {
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const role = req.body?.role;
    const errors = [];
    if (!username)
        errors.push("username is required");
    if (!ADMIN_ROLES.includes(role))
        errors.push(`role must be one of ${ADMIN_ROLES.join(", ")}`);
    if (errors.length > 0) {
        const body = { success: false, error: errors.join("; ") };
        res.status(400).json(body);
        return;
    }
    try {
        const temporaryPassword = (0, generateTempPassword_1.generateTempPassword)();
        const passwordHash = await bcrypt_1.default.hash(temporaryPassword, BCRYPT_ROUNDS);
        const staff = await prisma_1.prisma.adminUser.create({
            data: {
                username,
                passwordHash,
                role: role,
                createdByAdminId: req.adminUser.id,
            },
        });
        const body = {
            success: true,
            data: { staff: (0, serialize_1.toSharedAdminUser)(staff), temporaryPassword },
        };
        res.status(201).json(body);
    }
    catch (err) {
        // Unique constraint violation on username (Prisma error code P2002) -
        // checked structurally rather than importing
        // PrismaClientKnownRequestError, same pattern as PATCH
        // /api/users/me/profile's email-uniqueness check. Fires when
        // `username` collides with an existing AdminUser, including a
        // deactivated one - usernames are never freed up on deactivation.
        if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
            const body = { success: false, error: "Username is already taken" };
            res.status(409).json(body);
            return;
        }
        throw err;
    }
});
exports.adminStaffRouter.get("/staff", adminAuth_1.requireAdminAuth, (0, adminAuth_1.requireRole)(["ADMIN"]), async (_req, res) => {
    const staff = await prisma_1.prisma.adminUser.findMany({ orderBy: { createdAt: "asc" } });
    const body = {
        success: true,
        data: { staff: staff.map(serialize_1.toSharedAdminUser) },
    };
    res.json(body);
});
// Toggles isActive - the only way access is revoked. No delete route:
// same audit-preserving pattern as suspending a User rather than deleting
// it (createdByAdminId, and anything else logged by admin id elsewhere,
// stays attributable to a real row).
exports.adminStaffRouter.patch("/staff/:id", adminAuth_1.requireAdminAuth, (0, adminAuth_1.requireRole)(["ADMIN"]), async (req, res) => {
    const staffId = req.params.id;
    const isActive = req.body?.isActive;
    if (typeof isActive !== "boolean") {
        const body = { success: false, error: "isActive must be a boolean" };
        res.status(400).json(body);
        return;
    }
    try {
        const existing = await prisma_1.prisma.adminUser.findUnique({ where: { id: staffId } });
        if (!existing)
            throw new StaffNotFoundError();
        const updated = await prisma_1.prisma.adminUser.update({
            where: { id: staffId },
            data: { isActive },
        });
        const body = {
            success: true,
            data: { staff: (0, serialize_1.toSharedAdminUser)(updated) },
        };
        res.json(body);
    }
    catch (err) {
        if (err instanceof StaffNotFoundError) {
            const body = { success: false, error: "Staff account not found" };
            res.status(404).json(body);
            return;
        }
        throw err;
    }
});
//# sourceMappingURL=adminStaff.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminAuthRouter = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const adminSession_1 = require("../lib/adminSession");
const adminAuthConfig_1 = require("../lib/adminAuthConfig");
const serialize_1 = require("../lib/serialize");
const adminAuth_1 = require("../middleware/adminAuth");
const rateLimit_1 = require("../middleware/rateLimit");
exports.adminAuthRouter = (0, express_1.Router)();
// Separate login endpoint from customer auth (POST /api/auth/otp/verify):
// username + bcrypt-compared password instead of phone + OTP, and issues
// its own admin_session cookie/JWT (see lib/adminSession.ts) - a customer
// session token is never valid here and vice versa.
exports.adminAuthRouter.post("/login", rateLimit_1.adminLoginLimiter, async (req, res) => {
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!username || !password) {
        const body = {
            success: false,
            error: "username and password are required",
        };
        res.status(400).json(body);
        return;
    }
    // Same error message whether the username doesn't exist, the password
    // is wrong, or the account is deactivated - never let a login attempt
    // distinguish "no such account" from "wrong password" or "revoked".
    const invalidCredentials = () => {
        const body = { success: false, error: "Invalid username or password" };
        res.status(401).json(body);
    };
    const admin = await prisma_1.prisma.adminUser.findUnique({ where: { username } });
    if (!admin || !admin.isActive) {
        invalidCredentials();
        return;
    }
    const passwordMatches = await bcrypt_1.default.compare(password, admin.passwordHash);
    if (!passwordMatches) {
        invalidCredentials();
        return;
    }
    const token = await (0, adminSession_1.issueAdminSessionToken)(admin);
    res.cookie(adminAuthConfig_1.ADMIN_SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: adminAuthConfig_1.ADMIN_SESSION_MAX_AGE_SECONDS * 1000,
        path: "/",
    });
    const body = {
        success: true,
        data: { admin: (0, serialize_1.toSharedAdminUser)(admin), token },
    };
    res.json(body);
});
exports.adminAuthRouter.post("/logout", (_req, res) => {
    res.clearCookie(adminAuthConfig_1.ADMIN_SESSION_COOKIE_NAME, { path: "/" });
    const body = {
        success: true,
        data: { message: "Logged out" },
    };
    res.json(body);
});
// Lets the admin frontend layout confirm session validity and know the
// caller's role on load (ADMIN vs SUPPORT renders a different dashboard) -
// see /admin's layout, which is entirely separate from the customer app's
// useAuth context.
exports.adminAuthRouter.get("/me", adminAuth_1.requireAdminAuth, (req, res) => {
    const body = {
        success: true,
        data: { admin: (0, serialize_1.toSharedAdminUser)(req.adminUser) },
    };
    res.json(body);
});
//# sourceMappingURL=adminAuth.js.map
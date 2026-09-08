"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.alertsRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const serialize_1 = require("../lib/serialize");
exports.alertsRouter = (0, express_1.Router)();
const ALL_CATEGORIES = ["MOVIE", "EVENT", "SPORT"];
const DEFAULT_RADIUS_KM = 7;
// "extendable" per the product ask isn't implemented in this pass - an
// expired alert just stops matching (see jobs/matchAlerts.ts) and has to
// be recreated.
const ALERT_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
function requireNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
// Accepts a real number (JSON bodies) or a numeric string, matching the
// same helper shape used across the other routes.
function requireFiniteNumber(value) {
    if (typeof value === "number")
        return Number.isFinite(value) ? value : null;
    if (typeof value !== "string" || value.trim() === "")
        return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}
class AlertNotFoundError extends Error {
}
class NotAlertOwnerError extends Error {
}
// Creates a "Notify me" saved search - see jobs/matchAlerts.ts for what
// actually fires it, and GET /:id/search for the identical fuzzy-match +
// radius approach this mirrors. lat/lng are required (the same
// search-origin the buy page already resolved, via geolocation or the
// city picker, before offering this form); cityId is display-only,
// carried through only when that's how the origin was resolved.
exports.alertsRouter.post("/", auth_1.requireAuth, async (req, res) => {
    const titleQuery = requireNonEmptyString(req.body?.titleQuery);
    const cityId = requireNonEmptyString(req.body?.cityId);
    const lat = requireFiniteNumber(req.body?.lat);
    const lng = requireFiniteNumber(req.body?.lng);
    const errors = [];
    if (!titleQuery)
        errors.push("titleQuery is required");
    if (lat === null || lat < -90 || lat > 90) {
        errors.push("lat is required and must be a number between -90 and 90");
    }
    if (lng === null || lng < -180 || lng > 180) {
        errors.push("lng is required and must be a number between -180 and 180");
    }
    let radiusKm = DEFAULT_RADIUS_KM;
    if (req.body?.radiusKm !== undefined) {
        const parsed = requireFiniteNumber(req.body.radiusKm);
        if (parsed === null || parsed <= 0) {
            errors.push("radiusKm must be a positive number");
        }
        else {
            radiusKm = parsed;
        }
    }
    let category = "MOVIE";
    if (req.body?.category !== undefined) {
        if (typeof req.body.category !== "string" ||
            !ALL_CATEGORIES.includes(req.body.category)) {
            errors.push(`category must be one of ${ALL_CATEGORIES.join(", ")}`);
        }
        else {
            category = req.body.category;
        }
    }
    if (errors.length > 0) {
        const body = { success: false, error: errors.join("; ") };
        res.status(400).json(body);
        return;
    }
    const alert = await prisma_1.prisma.ticketAlert.create({
        data: {
            userId: req.user.id,
            titleQuery: titleQuery,
            cityId,
            lat: lat,
            lng: lng,
            radiusKm,
            category,
            expiresAt: new Date(Date.now() + ALERT_DURATION_MS),
        },
    });
    const body = {
        success: true,
        data: { alert: (0, serialize_1.toSharedTicketAlert)(alert) },
    };
    res.status(201).json(body);
});
// The caller's own saved searches, newest first - every one regardless of
// isActive/expiresAt (not just currently-live ones), so /account/alerts
// can show cancelled/expired history too rather than just disappearing.
exports.alertsRouter.get("/mine", auth_1.requireAuth, async (req, res) => {
    const alerts = await prisma_1.prisma.ticketAlert.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: "desc" },
    });
    const body = {
        success: true,
        data: { alerts: alerts.map(serialize_1.toSharedTicketAlert) },
    };
    res.json(body);
});
// Soft-cancel (isActive = false), not a hard delete - preserves the
// alert's AlertNotification history (and the FK it lives behind) and lets
// /account/alerts keep showing it as cancelled rather than it just
// vanishing.
exports.alertsRouter.delete("/:id", auth_1.requireAuth, async (req, res) => {
    const alertId = req.params.id;
    try {
        const existing = await prisma_1.prisma.ticketAlert.findUnique({
            where: { id: alertId },
            select: { id: true, userId: true },
        });
        if (!existing)
            throw new AlertNotFoundError();
        if (existing.userId !== req.user.id)
            throw new NotAlertOwnerError();
        const updated = await prisma_1.prisma.ticketAlert.update({
            where: { id: alertId },
            data: { isActive: false },
        });
        const body = {
            success: true,
            data: { alert: (0, serialize_1.toSharedTicketAlert)(updated) },
        };
        res.json(body);
    }
    catch (err) {
        if (err instanceof AlertNotFoundError) {
            const body = { success: false, error: "Alert not found" };
            res.status(404).json(body);
            return;
        }
        if (err instanceof NotAlertOwnerError) {
            const body = {
                success: false,
                error: "Only the owner of this alert can cancel it",
            };
            res.status(403).json(body);
            return;
        }
        throw err;
    }
});
//# sourceMappingURL=alerts.js.map
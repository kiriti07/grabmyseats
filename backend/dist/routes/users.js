"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usersRouter = void 0;
const node_crypto_1 = require("node:crypto");
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const storage_1 = require("../lib/storage");
const auth_1 = require("../middleware/auth");
const upload_1 = require("../middleware/upload");
const sellerTrust_1 = require("../lib/sellerTrust");
const ratingSummary_1 = require("../lib/ratingSummary");
const serialize_1 = require("../lib/serialize");
const validators_1 = require("../lib/validators");
exports.usersRouter = (0, express_1.Router)();
// Whether this user currently qualifies to offer EMAIL_FORWARD delivery as
// a seller - the sell form calls this to explain the trust gate (rather
// than just hiding the option) before the seller picks delivery methods.
// See lib/sellerTrust.ts, which POST /api/listings also enforces
// server-side.
exports.usersRouter.get("/me/delivery-eligibility", auth_1.requireAuth, async (req, res) => {
    const eligibility = await (0, sellerTrust_1.getSellerDeliveryEligibility)(req.user.id);
    const body = { success: true, data: eligibility };
    res.json(body);
});
exports.usersRouter.get("/me/profile", auth_1.requireAuth, async (req, res) => {
    const body = {
        success: true,
        data: { user: (0, serialize_1.toSharedUser)(req.user) },
    };
    res.json(body);
});
// Public, unauthenticated - the aggregate consumed by the listing detail
// page and the contact-reveal screen (which embed it themselves without
// exposing a user id - see sellerRatingSummary/TransactionContact.ratingSummary),
// and also directly callable with an id, e.g. from a future seller
// profile page. No existence check on :id: a bogus/nonexistent id and a
// real seller with zero ratings both just come back as "no ratings" -
// deliberately indistinguishable, rather than a 404 that would let this
// endpoint be used to probe which user ids exist.
exports.usersRouter.get("/:id/rating-summary", async (req, res) => {
    const userId = req.params.id;
    const summary = await (0, ratingSummary_1.getRatingSummary)(userId);
    const body = { success: true, data: summary };
    res.json(body);
});
function requireNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
// Edits the profile fields below - phone is deliberately absent from this
// endpoint entirely: it's the OTP-verified login identity, and changing it
// is a separate, more careful flow to design later, not part of this one.
// Every text field here is a full replace, not a partial merge - the edit
// form always submits the whole profile, so an omitted/blank optional
// field means "clear it". profileImageUrl is the one exception: it only
// changes when a profileImage file is actually attached to this request,
// same "send only what's changing" shape as PATCH /api/listings/:id.
exports.usersRouter.patch("/me/profile", auth_1.requireAuth, upload_1.uploadProfileImage, async (req, res) => {
    const fullName = requireNonEmptyString(req.body?.fullName);
    const email = requireNonEmptyString(req.body?.email);
    const dateOfBirthRaw = requireNonEmptyString(req.body?.dateOfBirth);
    const gender = requireNonEmptyString(req.body?.gender);
    const address = requireNonEmptyString(req.body?.address);
    // A checkbox, not free text - multipart fields are always strings, so
    // this is "true" or absent/anything else, not a real boolean on the
    // wire. Always sent by the edit form (no "omitted means unchanged" case
    // the text fields above have).
    const hasWhatsapp = req.body?.hasWhatsapp === "true";
    const errors = [];
    if (!fullName)
        errors.push("fullName is required");
    if (email && !(0, validators_1.isValidEmail)(email))
        errors.push("email must be a valid email address");
    let dateOfBirth = null;
    if (dateOfBirthRaw) {
        const parsed = new Date(dateOfBirthRaw);
        if (Number.isNaN(parsed.getTime())) {
            errors.push("dateOfBirth must be a valid date");
        }
        else if (parsed.getTime() > Date.now()) {
            errors.push("dateOfBirth cannot be in the future");
        }
        else {
            dateOfBirth = parsed;
        }
    }
    if (errors.length > 0) {
        const body = { success: false, error: errors.join("; ") };
        res.status(400).json(body);
        return;
    }
    let profileImageUrl;
    if (req.file) {
        const filename = `${req.user.id}-${(0, node_crypto_1.randomUUID)()}`;
        const uploaded = await storage_1.storageProvider.upload(req.file.buffer, filename, {
            folder: "profiles",
        });
        profileImageUrl = uploaded.url;
    }
    try {
        const updated = await prisma_1.prisma.user.update({
            where: { id: req.user.id },
            data: {
                fullName,
                email,
                dateOfBirth,
                gender,
                address,
                hasWhatsapp,
                ...(profileImageUrl ? { profileImageUrl } : {}),
            },
        });
        const body = {
            success: true,
            data: { user: (0, serialize_1.toSharedUser)(updated) },
        };
        res.json(body);
    }
    catch (err) {
        // Unique constraint violation on email (Prisma error code P2002) -
        // checked structurally rather than importing PrismaClientKnownRequestError,
        // matching the loose Prisma-error handling already used elsewhere in
        // this codebase (see the theaterLocation catch in POST /api/listings).
        if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
            const body = {
                success: false,
                error: "That email is already in use by another account",
            };
            res.status(409).json(body);
            return;
        }
        throw err;
    }
});
//# sourceMappingURL=users.js.map
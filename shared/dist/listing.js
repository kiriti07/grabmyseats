"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LIVE_LISTING_STATUSES = void 0;
// Statuses a listing can still be acted on in - editable, mark-sold-able,
// deactivatable. Everything else is terminal. Shared so the seller
// dashboard's "hide these actions" check and the backend's own guards on
// PATCH/:id, /:id/mark-sold, and /:id/deactivate can never drift apart.
exports.LIVE_LISTING_STATUSES = ["ACTIVE", "PARTIALLY_SOLD"];

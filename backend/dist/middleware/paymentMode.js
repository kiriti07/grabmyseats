"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireEscrowMode = requireEscrowMode;
const config_1 = require("../lib/config");
// Gates a route to escrow mode only. Mounted on POST /:id/pay, /:id/check-in,
// and /:id/confirm-receipt (see routes/transactions.ts) so those paths are
// unreachable under PAYMENT_MODE=contact_only without deleting any of the
// code behind them - escrow mode can be re-enabled later with no rebuild.
// 404, not 403: in contact_only mode these routes are meant to look like
// they don't exist, not like a permission was denied.
function requireEscrowMode(_req, res, next) {
    if (config_1.PAYMENT_MODE !== "escrow") {
        const body = { success: false, error: "Not found" };
        res.status(404).json(body);
        return;
    }
    next();
}
//# sourceMappingURL=paymentMode.js.map
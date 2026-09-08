"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startJobs = startJobs;
const node_cron_1 = require("node-cron");
const expireReservations_1 = require("./expireReservations");
const autoConfirmStaleEscrows_1 = require("./autoConfirmStaleEscrows");
const releasePayouts_1 = require("./releasePayouts");
const matchAlerts_1 = require("./matchAlerts");
const config_1 = require("../lib/config");
function startJobs() {
    (0, node_cron_1.schedule)("* * * * *", async () => {
        try {
            const count = await (0, expireReservations_1.expireReservations)();
            if (count > 0)
                console.log(`[jobs] expired ${count} reservation(s)`);
        }
        catch (err) {
            console.error("[jobs] expireReservations failed", err);
        }
    }, { name: "expire-reservations", noOverlap: true });
    (0, node_cron_1.schedule)("*/5 * * * *", async () => {
        try {
            const count = await (0, autoConfirmStaleEscrows_1.autoConfirmStaleEscrows)();
            if (count > 0)
                console.log(`[jobs] auto-confirmed ${count} stale escrow(s)`);
        }
        catch (err) {
            console.error("[jobs] autoConfirmStaleEscrows failed", err);
        }
    }, { name: "auto-confirm-stale-escrows", noOverlap: true });
    // Not scheduled at all in contact_only mode - there's no escrow for this
    // job to release a payout from (see PAYMENT_MODE in lib/config.ts). The
    // job itself stays intact so escrow mode can be re-enabled with no
    // rebuild, just this one line switching it back on.
    if (config_1.PAYMENT_MODE === "escrow") {
        (0, node_cron_1.schedule)("*/5 * * * *", async () => {
            try {
                const count = await (0, releasePayouts_1.releasePayouts)();
                if (count > 0)
                    console.log(`[jobs] released ${count} payout(s)`);
            }
            catch (err) {
                console.error("[jobs] releasePayouts failed", err);
            }
        }, { name: "release-payouts", noOverlap: true });
    }
    (0, node_cron_1.schedule)("*/5 * * * *", async () => {
        try {
            const count = await (0, matchAlerts_1.matchAlerts)();
            if (count > 0)
                console.log(`[jobs] notified ${count} ticket alert(s)`);
        }
        catch (err) {
            console.error("[jobs] matchAlerts failed", err);
        }
    }, { name: "match-alerts", noOverlap: true });
}
//# sourceMappingURL=index.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const multer_1 = __importDefault(require("multer"));
const auth_1 = require("./middleware/auth");
const adminAuth_1 = require("./middleware/adminAuth");
const upload_1 = require("./middleware/upload");
const auth_2 = require("./routes/auth");
const listings_1 = require("./routes/listings");
const transactions_1 = require("./routes/transactions");
const webhooks_1 = require("./routes/webhooks");
const admin_1 = require("./routes/admin");
const adminAuth_2 = require("./routes/adminAuth");
const adminStaff_1 = require("./routes/adminStaff");
const users_1 = require("./routes/users");
const alerts_1 = require("./routes/alerts");
const fraudReports_1 = require("./routes/fraudReports");
const dev_1 = require("./routes/dev");
exports.app = (0, express_1.default)();
// Comma-separated so both the apex domain and "www" (or any other
// alternate origin, e.g. a staging site) can be allowed at once - cors
// accepts an array here just as well as a single string. Trimmed so
// "https://a.com, https://b.com" (a space after the comma) works too.
const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
exports.app.use((0, cors_1.default)({
    origin: allowedOrigins,
    credentials: true,
}));
// Mounted before express.json(): this route needs the raw request body to
// verify Razorpay's signature, and express.json() would otherwise consume
// and parse the body stream before this router ever sees it.
exports.app.use("/api/webhooks", webhooks_1.webhooksRouter);
exports.app.use(express_1.default.json());
exports.app.use(auth_1.attachUser);
exports.app.use(adminAuth_1.attachAdminUser);
exports.app.get("/health", (_req, res) => {
    const body = {
        success: true,
        data: { status: "ok" },
    };
    res.json(body);
});
exports.app.use("/api/auth", auth_2.authRouter);
exports.app.use("/api/listings", listings_1.listingsRouter);
exports.app.use("/api/transactions", transactions_1.transactionsRouter);
exports.app.use("/api/admin/auth", adminAuth_2.adminAuthRouter);
exports.app.use("/api/admin", adminStaff_1.adminStaffRouter);
exports.app.use("/api/admin", admin_1.adminRouter);
exports.app.use("/api/users", users_1.usersRouter);
exports.app.use("/api/alerts", alerts_1.alertsRouter);
exports.app.use("/api/fraud-reports", fraudReports_1.fraudReportsRouter);
// DEV-ONLY. Must NEVER be mounted in production - see routes/dev.ts for
// why. If you're reading this while debugging a prod incident: this
// condition is the only thing standing between that route and the
// internet, so if it's ever wrong, that's the bug to fix.
if (process.env.NODE_ENV !== "production") {
    exports.app.use("/api/dev", dev_1.devRouter);
}
const errorHandler = (err, _req, res, _next) => {
    // Logged unconditionally, before any status-code branching below, so
    // every error that reaches this handler - not just the generic 500s -
    // prints its full stack trace server-side. The client-facing response
    // stays generic/safe regardless; this never leaks to the client.
    console.error(err);
    if (err instanceof multer_1.default.MulterError || err instanceof upload_1.InvalidUploadError) {
        const body = { success: false, error: err.message };
        res.status(400).json(body);
        return;
    }
    const body = { success: false, error: "Internal server error" };
    res.status(500).json(body);
};
exports.app.use(errorHandler);
//# sourceMappingURL=app.js.map
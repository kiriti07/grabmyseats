"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhooksRouter = void 0;
const express_1 = __importStar(require("express"));
const razorpay_1 = __importDefault(require("razorpay"));
const prisma_1 = require("../lib/prisma");
const handlePaymentCaptured_1 = require("../lib/payments/handlePaymentCaptured");
exports.webhooksRouter = (0, express_1.Router)();
// Mounted with express.raw() (not express.json()) so req.body is the exact
// byte stream Razorpay signed - signature verification would fail against
// a body that's been parsed and re-serialized, since that can change
// whitespace/key order and produce different bytes.
exports.webhooksRouter.post("/razorpay", express_1.default.raw({ type: "application/json" }), async (req, res) => {
    const signature = req.headers["x-razorpay-signature"];
    const rawBody = req.body;
    if (typeof signature !== "string" || !Buffer.isBuffer(rawBody)) {
        const body = {
            success: false,
            error: "Missing signature or body",
        };
        res.status(400).json(body);
        return;
    }
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
        console.error("[webhooks] RAZORPAY_WEBHOOK_SECRET is not configured");
        const body = {
            success: false,
            error: "Webhook not configured",
        };
        res.status(500).json(body);
        return;
    }
    const rawBodyString = rawBody.toString("utf8");
    let isValid;
    try {
        isValid = razorpay_1.default.validateWebhookSignature(rawBodyString, signature, secret);
    }
    catch {
        isValid = false;
    }
    if (!isValid) {
        const body = {
            success: false,
            error: "Invalid webhook signature",
        };
        res.status(400).json(body);
        return;
    }
    let event;
    try {
        event = JSON.parse(rawBodyString);
    }
    catch {
        const body = { success: false, error: "Invalid JSON body" };
        res.status(400).json(body);
        return;
    }
    if (event.event !== "payment.captured") {
        // Acknowledge and ignore - we only act on this one event type.
        const body = {
            success: true,
            data: { message: "Event ignored" },
        };
        res.status(200).json(body);
        return;
    }
    const orderId = event.payload?.payment?.entity?.order_id;
    if (!orderId) {
        const body = {
            success: false,
            error: "payment.captured event missing order_id",
        };
        res.status(400).json(body);
        return;
    }
    const transaction = await prisma_1.prisma.transaction.findUnique({
        where: { razorpayOrderId: orderId },
    });
    if (!transaction) {
        console.error(`[webhooks] payment.captured for order ${orderId} has no matching transaction`);
        // 200 so Razorpay doesn't keep retrying a delivery we can never
        // resolve; the error above is what should page someone.
        const body = {
            success: true,
            data: { message: "No matching transaction" },
        };
        res.status(200).json(body);
        return;
    }
    const result = await (0, handlePaymentCaptured_1.handlePaymentCaptured)(transaction, orderId);
    const body = { success: true, data: result };
    res.status(200).json(body);
});
//# sourceMappingURL=webhooks.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.payoutProvider = void 0;
const MockPayoutProvider_1 = require("./MockPayoutProvider");
// The rest of the app only depends on the PayoutProvider interface, so
// going live with real money is a one-file change: swap the line below for
// `new RazorpayPayoutProvider()` (implemented in ./RazorpayPayoutProvider,
// backed by the real Razorpay SDK) once that's been tested against a real
// account.
exports.payoutProvider = new MockPayoutProvider_1.MockPayoutProvider();
//# sourceMappingURL=index.js.map
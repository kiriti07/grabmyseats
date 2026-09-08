"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockPayoutProvider = void 0;
const node_crypto_1 = require("node:crypto");
// Dev-only stub: no external calls, always succeeds, returns fake ids.
// Swap the provider wired up in `./index.ts` for a real one
// (RazorpayPayoutProvider, ...) when ready to move real money.
class MockPayoutProvider {
    async createLinkedAccount(_details) {
        return { accountId: `mock_acc_${(0, node_crypto_1.randomUUID)()}` };
    }
    async createEscrowOrder(_amount, _currency) {
        return { orderId: `mock_order_${(0, node_crypto_1.randomUUID)()}` };
    }
    async releaseTransfer(_transactionId) {
        return { transferId: `mock_transfer_${(0, node_crypto_1.randomUUID)()}` };
    }
    async refund(_transactionId) {
        return { refundId: `mock_refund_${(0, node_crypto_1.randomUUID)()}` };
    }
}
exports.MockPayoutProvider = MockPayoutProvider;
//# sourceMappingURL=MockPayoutProvider.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsoleSmsProvider = void 0;
// Dev-only stub: logs instead of sending. Swap the provider wired up in
// `./index.ts` for a real one (Twilio, MSG91, ...) when ready to go live.
class ConsoleSmsProvider {
    async send(phone, message) {
        console.log(`[sms] to ${phone}: ${message}`);
    }
}
exports.ConsoleSmsProvider = ConsoleSmsProvider;
//# sourceMappingURL=ConsoleSmsProvider.js.map
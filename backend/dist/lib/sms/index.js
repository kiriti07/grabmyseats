"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.smsProvider = void 0;
const ConsoleSmsProvider_1 = require("./ConsoleSmsProvider");
// The rest of the app only depends on the SmsProvider interface, so going
// live with a real vendor is a one-file change: add e.g. TwilioSmsProvider
// or Msg91SmsProvider (implementing SmsProvider) next to ConsoleSmsProvider,
// then swap the line below.
exports.smsProvider = new ConsoleSmsProvider_1.ConsoleSmsProvider();
//# sourceMappingURL=index.js.map
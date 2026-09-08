"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidEmail = isValidEmail;
// Deliberately loose (no full RFC 5322 parsing) - just enough to catch
// obvious typos on the profile form (PATCH /api/users/me/profile) without
// rejecting real addresses a stricter regex might choke on.
function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
//# sourceMappingURL=validators.js.map
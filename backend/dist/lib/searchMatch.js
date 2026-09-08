"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TITLE_SIMILARITY_THRESHOLD = void 0;
// Fuzzy-title-match threshold shared between GET /api/listings/search
// (routes/listings.ts) and the alert-matching cron (jobs/matchAlerts.ts) -
// "reuse the same pg_trgm approach as search" means this threshold too,
// not just the similarity() call shape.
exports.TITLE_SIMILARITY_THRESHOLD = 0.2;
//# sourceMappingURL=searchMatch.js.map
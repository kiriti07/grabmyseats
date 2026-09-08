// Buyer-to-seller rating - see POST /api/transactions/:id/rate and GET
// /api/users/:id/rating-summary (backend/src/routes/transactions.ts,
// routes/users.ts). One-directional: buyers rate sellers, never the
// reverse, and at most one rating per transaction.
export interface Rating {
  id: string;
  raterId: string;
  ratedUserId: string;
  transactionId: string;
  stars: number;
  comment: string | null;
  createdAt: string;
}

// POST /api/transactions/:id/rate request body. stars must be an integer
// 1-5; comment is optional (omit or send empty to leave it blank).
export interface CreateRatingInput {
  stars: number;
  comment?: string;
}

// One entry of RatingSummary.recentComments below - deliberately omits
// raterId even though GET /api/users/:id/rating-summary is a public,
// unauthenticated endpoint: showing "who left this" to any stranger
// looking up a seller would deanonymize buyers for no reason the feature
// needs.
export interface RatingSummaryComment {
  stars: number;
  comment: string;
  createdAt: string;
}

// GET /api/users/:id/rating-summary response, and what's embedded (for
// the seller specifically) into ListingDetail and TransactionContact so
// the listing detail page and contact-reveal screen can show it without a
// second round-trip. averageStars is null (not 0) when totalRatings is 0 -
// stars are always 1-5, so 0 could never be a real average, which is what
// lets the frontend render "No ratings yet" instead of a misleading "0 ★"
// for a new seller.
export interface RatingSummary {
  averageStars: number | null;
  totalRatings: number;
  recentComments: RatingSummaryComment[];
}

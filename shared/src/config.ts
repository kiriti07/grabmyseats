// "escrow" is the fully-built-out flow: reserve -> pay into escrow -> both
// parties check in near the venue -> buyer confirms receipt -> seller gets
// paid out. "contact_only" is a lightweight alternative: reserve just locks
// the seats and immediately hands the buyer the seller's contact info, and
// the two arrange payment/handoff directly outside the app - no escrow,
// check-in, or confirm-receipt sequence at all. Driven by PAYMENT_MODE on
// the backend (see backend/src/lib/config.ts, read once at process
// startup) and surfaced to the frontend on the API responses that need it
// (ListingDetail, TransactionDetail, the reserve response) rather than via
// a separate build-time frontend env var, so the two can never drift.
export type PaymentMode = "escrow" | "contact_only";

import type { PaymentMode } from "./config";
import type { DeliveryMethod, TxnStatus } from "./transaction";
import type { RatingSummary } from "./rating";

export type ListingStatus =
  | "ACTIVE"
  | "PARTIALLY_SOLD"
  | "SOLD"
  | "EXPIRED"
  | "FLAGGED"
  // Seller pulled the listing down themselves - see POST
  // /api/listings/:id/deactivate. Distinct from EXPIRED so the two are
  // distinguishable in reporting.
  | "WITHDRAWN";

// Statuses a listing can still be acted on in - editable, mark-sold-able,
// deactivatable. Everything else is terminal. Shared so the seller
// dashboard's "hide these actions" check and the backend's own guards on
// PATCH/:id, /:id/mark-sold, and /:id/deactivate can never drift apart.
export const LIVE_LISTING_STATUSES: ListingStatus[] = ["ACTIVE", "PARTIALLY_SOLD"];

// What kind of ticket this is. Only affects: the sell form's field labels
// and OCR auto-fill (MOVIE gets the full movie-tuned pipeline; EVENT/SPORT
// skip it entirely - see POST /api/listings/ocr) and the buy page's
// category filter. Everything downstream of a listing existing -
// reservation, contact-reveal, delivery method, mark-sold/deactivate,
// edit - is deliberately category-agnostic and must never branch on this.
export type Category = "MOVIE" | "EVENT" | "SPORT";

export interface Listing {
  id: string;
  sellerId: string;
  category: Category;
  movieName: string;
  theaterName: string;
  theaterLat: number;
  theaterLng: number;
  showtime: string;
  bookingId: string;
  totalSeats: number;
  availableSeats: number;
  // What the seller offers - one or both. A buyer picks one of these at
  // reservation time (see POST /api/listings/:id/reserve). EMAIL_FORWARD is
  // only offerable by sellers who pass the trust gate - see
  // SellerDeliveryEligibility in ./user.ts.
  availableDeliveryMethods: DeliveryMethod[];
  pricePerSeat: number;
  // What the booking confirmation showed as the amount actually paid, when
  // detected (OCR'd, or seller-corrected on the sell form) - not required,
  // so still nullable even after listing creation. Kept for dispute
  // evidence and the price-integrity check in POST /api/listings; not
  // exposed on any buyer-facing shape below.
  totalAmountPaid: number | null;
  qrData: string | null;
  screenshotUrl: string | null;
  status: ListingStatus;
  createdAt: string;
}

// PATCH /api/listings/:id request body: all optional (only send what's
// changing), but totalSeats is rejected server-side unless
// availableSeats === totalSeats already - see the route for why (changing
// seat count once any are reserved/sold would corrupt that accounting).
export interface UpdateListingInput {
  pricePerSeat?: number;
  showtime?: string;
  totalSeats?: number;
}

// Public search result shape: deliberately omits bookingId, sellerId,
// screenshotUrl, and any other field that could leak the seller's identity
// or let someone use the ticket (its QR code / booking ID are visible in
// the screenshot) without paying. screenshotUrl is only ever revealed via
// GET /api/transactions/:id/screenshot, post-purchase.
export interface ListingSearchResult {
  id: string;
  movieName: string;
  theaterName: string;
  showtime: string;
  availableSeats: number;
  pricePerSeat: number;
  distanceKm: number;
}

// GET /api/listings/:id response: same public-safe fields as
// ListingSearchResult, plus totalSeats and status for a full detail view.
// distanceKm is null when the caller didn't pass an origin (e.g. a direct
// link rather than a tap-through from search results). Deliberately omits
// screenshotUrl - see the comment on ListingSearchResult above.
export interface ListingDetail {
  id: string;
  category: Category;
  movieName: string;
  theaterName: string;
  showtime: string;
  totalSeats: number;
  availableSeats: number;
  pricePerSeat: number;
  status: ListingStatus;
  distanceKm: number | null;
  availableDeliveryMethods: DeliveryMethod[];
  // The backend's current PAYMENT_MODE (see backend/src/lib/config.ts) -
  // carried on this response, rather than a separate frontend config fetch,
  // so the buy page knows before rendering whether to offer "Reserve
  // seats" (escrow) or "Get seller's contact info" (contact_only).
  paymentMode: PaymentMode;
  // The seller's rating summary (see RatingSummary in ./rating.ts) - shown
  // before a buyer reserves, without exposing the seller's id (this
  // endpoint never has, and still doesn't, carry sellerId - see GET
  // /api/users/:id/rating-summary for the identified equivalent).
  sellerRatingSummary: RatingSummary;
}

// GET /api/listings/mine response: the seller's own view of a listing.
// Transaction summaries deliberately omit the buyer's identity/contact -
// that's only ever revealed via GET /api/transactions/:id/contact, and
// only in the window around showtime.
export interface MyListingTransactionSummary {
  id: string;
  seatsCount: number;
  amountPaid: number;
  status: TxnStatus;
  confirmedAt: string | null;
  payoutAt: string | null;
}

export interface MyListing {
  id: string;
  category: Category;
  movieName: string;
  theaterName: string;
  showtime: string;
  totalSeats: number;
  availableSeats: number;
  // totalSeats - availableSeats. Note availableSeats (and status, below)
  // reflect a seat the moment it's reserved, not only once paid for - see
  // the comment on POST /:id/reserve's atomic UPDATE in
  // backend/src/routes/listings.ts.
  seatsSold: number;
  pricePerSeat: number;
  totalAmountPaid: number | null;
  screenshotUrl: string | null;
  status: ListingStatus;
  availableDeliveryMethods: DeliveryMethod[];
  createdAt: string;
  transactions: MyListingTransactionSummary[];
  // Seller-only insight - deliberately not on ListingSearchResult or
  // ListingDetail above, since a seller's view/contact counts shouldn't be
  // visible to buyers or competitors. viewCount increments on every GET
  // /api/listings/:id load (including anonymous ones); contactCount
  // increments once per contact_only-mode POST /:id/reserve, at the exact
  // point seller contact info is handed to a buyer.
  viewCount: number;
  contactCount: number;
}

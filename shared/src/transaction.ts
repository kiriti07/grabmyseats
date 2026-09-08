import type { PaymentMode } from "./config";
import type { RatingSummary } from "./rating";

export type TxnStatus =
  | "PENDING"
  | "RESERVED"
  | "EXPIRED"
  | "ESCROWED"
  | "BUYER_CONFIRMED"
  | "PAYOUT_RELEASED"
  | "DISPUTED"
  | "REFUNDED";

// How the buyer receives the ticket once escrowed. IN_PERSON needs both
// parties' venue check-in (unchanged). EMAIL_FORWARD skips the seller's
// check-in requirement - instead the seller uploads/forwards the original
// booking confirmation email post-escrow (see the /email-forward endpoints
// below) and that submission gates confirm-receipt instead. The buyer's own
// venue check-in stays mandatory either way - see POST
// /api/transactions/:id/confirm-receipt.
export type DeliveryMethod = "IN_PERSON" | "EMAIL_FORWARD";

export interface Transaction {
  id: string;
  listingId: string;
  buyerId: string;
  seatsCount: number;
  amountPaid: number;
  status: TxnStatus;
  deliveryMethod: DeliveryMethod;
  reservationExpiresAt: string | null;
  razorpayOrderId: string | null;
  transferId: string | null;
  refundId: string | null;
  refundedAt: string | null;
  buyerCheckInLat: number | null;
  buyerCheckInLng: number | null;
  buyerCheckInAt: string | null;
  sellerCheckInLat: number | null;
  sellerCheckInLng: number | null;
  sellerCheckInAt: string | null;
  // Set once the seller submits the forwarded booking email (EMAIL_FORWARD
  // only) - a status flag visible to both parties, distinct from the actual
  // content, which is only ever revealed to the buyer via GET
  // /api/transactions/:id/email-forward, same access-control pattern as the
  // listing screenshot.
  emailForwardSubmittedAt: string | null;
  confirmedAt: string | null;
  payoutAt: string | null;
  createdAt: string;
}

// GET /api/transactions/:id/contact response: the other party's contact
// details, only available within the 30-minute window around showtime (in
// escrow mode - see PAYMENT_MODE). Also what ReserveResult.contact below
// carries for the contact-only reserve response - same shape either way.
// phone is always a tel:-usable E.164 string ("+<countrycode><digits>", no
// spaces/formatting - enforced at signup, see PHONE_RE in
// backend/src/routes/auth.ts); hasWhatsapp just tells the frontend whether
// phone can *also* be turned into a wa.me link.
export interface TransactionContact {
  name: string | null;
  phone: string;
  hasWhatsapp: boolean;
  // The seller's rating summary, when this contact IS the seller (i.e.
  // the caller is the buyer) - null when the caller is the seller viewing
  // the buyer's contact, since buyers aren't rated in this one-directional
  // system. See RatingSummary in ./rating.ts.
  ratingSummary: RatingSummary | null;
}

// GET /api/transactions/:id/email-forward response: the buyer's view of the
// seller-forwarded booking confirmation email (EMAIL_FORWARD delivery
// only). text/fileUrl are both null until the seller submits - that's a
// normal (200) response, not an error, so the buyer's page can poll it the
// same way it polls check-in state. Never returned to anyone but the buyer
// on this transaction - see the route for the same access-control pattern
// as GET /api/transactions/:id/screenshot.
export interface TransactionEmailForward {
  text: string | null;
  fileUrl: string | null;
  submittedAt: string | null;
}

// GET /api/transactions/:id response: enough to render the transaction
// detail page for either party. `party` is server-computed (same
// buyerId/listing.sellerId check every other :id route already does) so
// the client never has to re-derive "am I the buyer or the seller" itself.
export interface TransactionDetail {
  transaction: Transaction;
  listing: {
    id: string;
    movieName: string;
    theaterName: string;
    showtime: string;
  };
  party: "buyer" | "seller";
  // The backend's current PAYMENT_MODE (see backend/src/lib/config.ts).
  // contact_only transactions never leave RESERVED and have no
  // payment/check-in/confirm-receipt sequence at all - the page uses this
  // to render a plain contact-reveal view instead of the escrow-mode UI.
  paymentMode: PaymentMode;
}

// POST /api/listings/:id/reserve response. `contact` is populated only
// when paymentMode is "contact_only" - the seller's contact info is handed
// over immediately since there's no escrow/check-in sequence gating it in
// that mode (see GET /api/transactions/:id/contact, whose usual 30-minute
// showtime window is also skipped in this mode). Always null in escrow
// mode, where contact stays gated the normal way.
export interface ReserveResult {
  transaction: Transaction;
  contact: TransactionContact | null;
  paymentMode: PaymentMode;
}

// GET /api/transactions/mine response: the buyer's own past reservations/
// purchases, newest first - what /account/purchases lists, and where the
// "Rate this seller" prompt lives (isRated tells the client whether to
// show it, without a separate per-transaction lookup - see POST
// /api/transactions/:id/rate).
export interface MyPurchase {
  id: string;
  status: TxnStatus;
  seatsCount: number;
  amountPaid: number;
  createdAt: string;
  listing: {
    id: string;
    movieName: string;
    theaterName: string;
    showtime: string;
  };
  isRated: boolean;
}

import type {
  ApiResponse,
  Category,
  CreateRatingInput,
  CreateTicketAlertInput,
  DeliveryMethod,
  FraudReport,
  GeocodePreview,
  Listing,
  ListingDetail,
  ListingSearchResult,
  MyListing,
  MyPurchase,
  OcrResult,
  Rating,
  RatingSummary,
  RazorpayCheckoutOrder,
  ReserveResult,
  SellerDeliveryEligibility,
  Transaction,
  TransactionContact,
  TransactionDetail,
  TransactionEmailForward,
  TicketAlert,
  UpdateListingInput,
  UpdateProfileInput,
  User,
} from "@grabmyseats/shared";
import { API_BASE_URL } from "./config";
import { getToken } from "./token";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readApiBody<T>(res: Response): Promise<T> {
  let body: ApiResponse<T> | undefined;
  try {
    body = await res.json();
  } catch {
    // fall through to the generic error below
  }

  if (!body) {
    throw new ApiError("Something went wrong. Please try again.", res.status);
  }
  if (!body.success) {
    throw new ApiError(body.error, res.status);
  }
  return body.data;
}

// Every call goes through here, so the bearer token (when we have one) is
// attached automatically instead of every caller remembering to add it -
// public endpoints just won't have a token to attach.
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError("Couldn't reach the server. Check your connection.", 0);
  }
  return readApiBody<T>(res);
}

export function requestOtp(phone: string): Promise<{ message: string }> {
  return request("/api/auth/otp/request", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export function verifyOtpCode(
  phone: string,
  code: string,
): Promise<{ user: User; token: string }> {
  return request("/api/auth/otp/verify", {
    method: "POST",
    body: JSON.stringify({ phone, code }),
  });
}

export function fetchMe(token: string): Promise<{ user: User }> {
  return request("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function searchListings(params: {
  lat: number;
  lng: number;
  movieName?: string;
  category?: Category;
}): Promise<{ listings: ListingSearchResult[] }> {
  const query = new URLSearchParams({
    lat: String(params.lat),
    lng: String(params.lng),
  });
  if (params.movieName) query.set("movieName", params.movieName);
  if (params.category) query.set("category", params.category);
  return request(`/api/listings/search?${query.toString()}`);
}

export function getListing(
  id: string,
  coords?: { lat: number; lng: number } | null,
): Promise<{ listing: ListingDetail }> {
  const query = coords ? `?lat=${coords.lat}&lng=${coords.lng}` : "";
  return request(`/api/listings/${id}${query}`);
}

// deliveryMethod is only meaningful (and only sent) in escrow mode - in
// contact_only mode there's no check-in/email-forward machinery for it to
// drive, so the buyer is never asked for one. See ReserveResult: `contact`
// comes back populated only in contact_only mode.
export function reserveListing(
  id: string,
  seats: number,
  deliveryMethod?: DeliveryMethod,
): Promise<ReserveResult> {
  return request(`/api/listings/${id}/reserve`, {
    method: "POST",
    body: JSON.stringify({ seats, ...(deliveryMethod ? { deliveryMethod } : {}) }),
  });
}

export function fetchDeliveryEligibility(): Promise<SellerDeliveryEligibility> {
  return request("/api/users/me/delivery-eligibility");
}

export function fetchMyListings(): Promise<{ listings: MyListing[] }> {
  return request("/api/listings/mine");
}

// Seller declares seats sold outside the app - see POST
// /api/listings/:id/mark-sold. Irreversible; the caller should confirm
// before calling this.
export function markListingSold(id: string, seats: number): Promise<{ listing: Listing }> {
  return request(`/api/listings/${id}/mark-sold`, {
    method: "POST",
    body: JSON.stringify({ seats }),
  });
}

// Seller pulls a listing down without claiming a sale happened - see POST
// /api/listings/:id/deactivate. Irreversible.
export function deactivateListing(id: string): Promise<{ listing: Listing }> {
  return request(`/api/listings/${id}/deactivate`, { method: "POST" });
}

// Edits pricePerSeat/showtime/totalSeats on a still-live listing - see
// PATCH /api/listings/:id. Only send the fields that are changing.
export function updateListing(
  id: string,
  data: UpdateListingInput,
): Promise<{ listing: Listing }> {
  return request(`/api/listings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// Buyer's own past reservations/purchases, newest first - see GET
// /api/transactions/mine and /account/purchases.
export function fetchMyPurchases(): Promise<{ purchases: MyPurchase[] }> {
  return request("/api/transactions/mine");
}

// Buyer rates the seller once, ever, per transaction - see POST
// /api/transactions/:id/rate.
export function rateTransaction(
  transactionId: string,
  data: CreateRatingInput,
): Promise<{ rating: Rating }> {
  return request(`/api/transactions/${transactionId}/rate`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// Public, unauthenticated - see GET /api/users/:id/rating-summary.
export function fetchRatingSummary(userId: string): Promise<RatingSummary> {
  return request(`/api/users/${userId}/rating-summary`);
}

// Transaction detail for either party (buyer or seller) - status, the
// listing's showtime, and both parties' check-in state. See GET
// /api/transactions/:id.
export function fetchTransactionDetail(transactionId: string): Promise<TransactionDetail> {
  return request(`/api/transactions/${transactionId}`);
}

export function checkInToTransaction(
  transactionId: string,
  lat: number,
  lng: number,
): Promise<{ transaction: Transaction }> {
  return request(`/api/transactions/${transactionId}/check-in`, {
    method: "POST",
    body: JSON.stringify({ lat, lng }),
  });
}

// The other party's contact details - only available within 30 minutes
// either side of showtime. See GET /api/transactions/:id/contact.
export function fetchTransactionContact(
  transactionId: string,
): Promise<{ contact: TransactionContact }> {
  return request(`/api/transactions/${transactionId}/contact`);
}

export function confirmReceipt(
  transactionId: string,
): Promise<{ transaction: Transaction }> {
  return request(`/api/transactions/${transactionId}/confirm-receipt`, { method: "POST" });
}

export function payForTransaction(
  transactionId: string,
): Promise<{ order: RazorpayCheckoutOrder }> {
  return request(`/api/transactions/${transactionId}/pay`, { method: "POST" });
}

// Buyer's proof-of-purchase: the listing's screenshot (QR code + booking
// ID) is only ever revealed here, after the transaction is escrowed - see
// GET /api/transactions/:id/screenshot. Throws (409) with a clear message
// if called before that, which the caller can use to decide whether to
// keep polling.
export function fetchTransactionScreenshot(
  transactionId: string,
): Promise<{ screenshotUrl: string | null }> {
  return request(`/api/transactions/${transactionId}/screenshot`);
}

// Buyer's view of the seller-forwarded booking email (EMAIL_FORWARD
// delivery only) - see GET /api/transactions/:id/email-forward. A
// submittedAt of null is a normal, poll-able "not sent yet" state, not an
// error.
export function fetchTransactionEmailForward(
  transactionId: string,
): Promise<TransactionEmailForward> {
  return request(`/api/transactions/${transactionId}/email-forward`);
}

// Deliberately bypasses request()'s JSON Content-Type default so the
// browser can set its own multipart boundary.
async function multipartRequest<T>(
  path: string,
  formData: FormData,
  method: "POST" | "PATCH" = "POST",
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: "include",
      headers: { ...authHeaders() },
      body: formData,
    });
  } catch {
    throw new ApiError("Couldn't reach the server. Check your connection.", 0);
  }
  return readApiBody<T>(res);
}

export function createListing(formData: FormData): Promise<{ listing: Listing }> {
  return multipartRequest("/api/listings", formData);
}

export function fetchProfile(): Promise<{ user: User }> {
  return request("/api/users/me/profile");
}

// Full replace, not a partial merge - the edit form always submits the
// whole profile (see UpdateProfileInput). profileFile is optional and only
// changes profileImageUrl when actually attached - see the backend route.
export function updateProfile(
  data: UpdateProfileInput,
  profileFile?: File | null,
): Promise<{ user: User }> {
  const formData = new FormData();
  formData.append("fullName", data.fullName);
  if (data.email) formData.append("email", data.email);
  if (data.dateOfBirth) formData.append("dateOfBirth", data.dateOfBirth);
  if (data.gender) formData.append("gender", data.gender);
  if (data.address) formData.append("address", data.address);
  formData.append("hasWhatsapp", String(data.hasWhatsapp));
  if (profileFile) formData.append("profileImage", profileFile);
  return multipartRequest("/api/users/me/profile", formData, "PATCH");
}

// Seller's EMAIL_FORWARD delivery step: forwards the booking confirmation
// email as an uploaded file and/or pasted text (at least one is required -
// see the backend route for the same check). Required before the buyer can
// confirm receipt on this transaction.
export function submitEmailForward(
  transactionId: string,
  data: { file?: File | null; text?: string },
): Promise<{ transaction: Transaction }> {
  const formData = new FormData();
  if (data.file) formData.append("emailFile", data.file);
  if (data.text) formData.append("emailText", data.text);
  return multipartRequest(`/api/transactions/${transactionId}/email-forward`, formData);
}

// Runs OCR + QR decoding on a screenshot to pre-fill the sell form. Never
// creates a listing - the seller still has to confirm and submit.
// category gates the movie-tuned parts of the OCR pipeline server-side
// (poster-region masking, certification-tag stripping, "Screen N"
// filtering) - EVENT/SPORT get raw text extraction with no field auto-fill
// at all. See backend/src/routes/listings.ts's POST /ocr.
export function runOcr(file: File, category: Category): Promise<OcrResult> {
  const formData = new FormData();
  formData.append("screenshot", file);
  formData.append("category", category);
  return multipartRequest("/api/listings/ocr", formData);
}

// Previews where a theater name + city would resolve to. found=false is a
// normal response (not thrown), so the sell form can fall back to the
// manual venue picker.
export function geocodeVenue(theaterName: string, city: string): Promise<GeocodePreview> {
  return request("/api/listings/geocode", {
    method: "POST",
    body: JSON.stringify({ theaterName, city }),
  });
}

// "Notify me" saved search - see jobs/matchAlerts.ts (backend) for what
// actually fires it.
export function createAlert(data: CreateTicketAlertInput): Promise<{ alert: TicketAlert }> {
  return request("/api/alerts", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function fetchMyAlerts(): Promise<{ alerts: TicketAlert[] }> {
  return request("/api/alerts/mine");
}

// Soft-cancels (isActive: false) - see DELETE /api/alerts/:id.
export function cancelAlert(id: string): Promise<{ alert: TicketAlert }> {
  return request(`/api/alerts/${id}`, { method: "DELETE" });
}

// Reports another user for suspected fraud. reportedUserId or
// reportedPhone identifies who's being reported - the contact-reveal and
// transaction-detail "Report user" entry points only ever have a phone
// number on hand (see TransactionContact), not a user id, so phone is
// accepted as an equally valid alternative. evidence files are optional.
export function createFraudReport(data: {
  reportedUserId?: string;
  reportedPhone?: string;
  relatedTransactionId?: string;
  description: string;
  evidence?: File[];
}): Promise<{ report: FraudReport }> {
  const formData = new FormData();
  if (data.reportedUserId) formData.append("reportedUserId", data.reportedUserId);
  if (data.reportedPhone) formData.append("reportedPhone", data.reportedPhone);
  if (data.relatedTransactionId) formData.append("relatedTransactionId", data.relatedTransactionId);
  formData.append("description", data.description);
  for (const file of data.evidence ?? []) formData.append("evidence", file);
  return multipartRequest("/api/fraud-reports", formData);
}

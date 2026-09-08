// POST /api/listings/ocr response: best-effort fields parsed from a ticket
// screenshot, for pre-filling (never auto-submitting) the /sell form. Each
// field is null when extraction wasn't confident, rather than a guess -
// see backend/src/lib/parseListingText.ts.
export interface OcrExtractedFields {
  movieName: string | null;
  theaterName: string | null;
  showtime: string | null;
  totalSeats: number | null;
  pricePerSeat: number | null;
  bookingId: string | null;
  // What the booking confirmation shows as the actual amount paid (e.g.
  // "Total Amount ... ₹810.48") - distinct from pricePerSeat, which is
  // never printed on the ticket itself and is always seller-entered. Used
  // to block listing above what was actually paid - see POST
  // /api/listings and the sell form's pre-submit check.
  totalAmountPaid: number | null;
}

export interface OcrResult {
  fields: OcrExtractedFields;
  qrData: string | null;
}

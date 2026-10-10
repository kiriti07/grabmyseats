import { createHmac } from "node:crypto";

// Listing.ticketFingerprint: HMAC-SHA256 of a ticket's decoded barcode/QR
// payload (lib/ticketBarcode.ts), keyed by TICKET_FINGERPRINT_SECRET. Lets
// the same ticket be recognised when it's listed twice (the partial unique
// index in migration 20261011120000_listing_ticket_fingerprint) without
// storing the payload itself - which is effectively the ticket.
//
// Only surrounding whitespace is normalised; the barcode format isn't part
// of it, so the same payload as a QR code or a barcode matches. Changing the
// secret makes old and new fingerprints incomparable - duplicates across
// the change go undetected until the older listings' shows pass.

export class TicketFingerprintConfigError extends Error {
  constructor() {
    super("TICKET_FINGERPRINT_SECRET is not set (or shorter than 32 characters)");
  }
}

const MIN_SECRET_LENGTH = 32;

export function isTicketFingerprintConfigured(): boolean {
  return (process.env.TICKET_FINGERPRINT_SECRET?.length ?? 0) >= MIN_SECRET_LENGTH;
}

// No fallback secret, ever: a missing one fails the request (and, in
// production, startup - see index.ts).
export function ticketFingerprint(payload: string): string {
  const secret = process.env.TICKET_FINGERPRINT_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) throw new TicketFingerprintConfigError();
  return createHmac("sha256", secret).update(payload.trim(), "utf8").digest("hex");
}

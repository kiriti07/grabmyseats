-- AlterTable: nullable, no default - instant, existing rows untouched (they
-- stay NULL and outside the index below).
ALTER TABLE "Listing" ADD COLUMN     "ticketFingerprint" TEXT;

-- Hand-written (Prisma can't express a partial index, so it is not in
-- schema.prisma - generate future migrations schema-to-schema so it is never
-- dropped). One live listing per ticket: see lib/ticketFingerprint.ts and
-- HOLDS_TICKET_FINGERPRINT in routes/listings.ts, which must match this
-- WHERE clause. A WITHDRAWN listing with no seats sold frees its ticket;
-- EXPIRED and WITHDRAWN never become live again, so no status change can
-- violate this index.
CREATE UNIQUE INDEX "Listing_ticketFingerprint_live_key"
  ON "Listing" ("ticketFingerprint")
  WHERE "ticketFingerprint" IS NOT NULL
    AND (
      "status" IN ('ACTIVE', 'PARTIALLY_SOLD', 'SOLD', 'FLAGGED')
      OR ("status" = 'WITHDRAWN' AND "availableSeats" < "totalSeats")
    );

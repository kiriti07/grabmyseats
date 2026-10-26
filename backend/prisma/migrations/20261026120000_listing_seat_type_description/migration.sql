-- Listing: optional seat type and seller description (shared/src/
-- listingDetails.ts, POST/PATCH /api/listings). Nullable, no default, so
-- this is a metadata-only change: existing rows are not rewritten and stay
-- NULL. No index, trigger or constraint is touched.
-- Generated schema-to-schema (`prisma migrate diff --from-schema
-- --to-schema`), so no drift DROPs for the hand-written indexes.

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "description" VARCHAR(300),
ADD COLUMN     "seatType" TEXT;

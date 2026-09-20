-- NOTE: the auto-generated diff for this migration also proposed dropping
-- "Listing_movieName_trgm_idx", "Listing_theaterLocation_idx",
-- "TicketAlert_location_idx", and "TicketAlert_titleQuery_trgm_idx" - same
-- schema-vs-hand-written-SQL drift as prior migrations (see
-- 20260830124200_geo_and_trgm_search and 20260902120000_delivery_method).
-- Deliberately NOT doing that here.

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "contactCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;

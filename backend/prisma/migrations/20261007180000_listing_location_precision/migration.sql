-- CreateEnum
CREATE TYPE "LocationPrecision" AS ENUM ('EXACT', 'AREA', 'CITY');

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "cityId" TEXT,
ADD COLUMN     "locationPrecision" "LocationPrecision" NOT NULL DEFAULT 'CITY';


-- Hand-written, one-time backfill: every listing created before this
-- migration had its coordinates either confirmed by the seller on the map
-- or geocoded to the venue itself, so they're EXACT. The column's permanent
-- default stays CITY (above) so any future insert that forgets to set a
-- precision fails safe instead of claiming exactness.
UPDATE "Listing" SET "locationPrecision" = 'EXACT';

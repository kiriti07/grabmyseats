-- CreateEnum
CREATE TYPE "VenueSource" AS ENUM ('SELLER_CONFIRMED', 'SEEDED');

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "locality" TEXT NOT NULL DEFAULT '',
    "cityId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "source" "VenueSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenuePinVote" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenuePinVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Venue_cityId_normalizedName_locality_key" ON "Venue"("cityId", "normalizedName", "locality");

-- CreateIndex
CREATE UNIQUE INDEX "VenuePinVote_venueId_userId_key" ON "VenuePinVote"("venueId", "userId");

-- AddForeignKey
ALTER TABLE "VenuePinVote" ADD CONSTRAINT "VenuePinVote_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenuePinVote" ADD CONSTRAINT "VenuePinVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The rest of this migration is hand-written: schema.prisma can't express
-- GiST/trigram indexes, so a schema-driven diff never generates this - and,
-- like "Listing_movieName_trgm_idx" / "Listing_theaterLocation_idx" (see
-- 20260830124200_geo_and_trgm_search), a diff against a live database will
-- see it as drift and propose dropping it. Future migrations must be
-- generated schema-to-schema (prisma migrate diff --from-schema/--to-schema)
-- or hand-checked so they never DROP these indexes.

-- Speeds up pg_trgm fuzzy venue-name matching (the % operator in
-- lib/geo/venueLookup.ts). pg_trgm itself was enabled in
-- 20260830124200_geo_and_trgm_search.
CREATE INDEX IF NOT EXISTS "Venue_normalizedName_trgm_idx" ON "Venue" USING GIST ("normalizedName" gist_trgm_ops);

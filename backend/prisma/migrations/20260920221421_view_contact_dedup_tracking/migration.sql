-- NOTE: hand-authored (not `prisma migrate dev`-generated) to avoid the
-- same schema-vs-hand-written-SQL drift as prior migrations proposing to
-- drop "Listing_movieName_trgm_idx"/"Listing_theaterLocation_idx"/
-- "TicketAlert_location_idx"/"TicketAlert_titleQuery_trgm_idx" - see
-- 20260830124200_geo_and_trgm_search and 20260902120000_delivery_method.
-- Content otherwise matches what Prisma would generate for this schema
-- diff: drop the plain viewCount/contactCount counters, replace with the
-- deduplicated ListingView/ListingContact tables.

-- AlterTable
ALTER TABLE "Listing" DROP COLUMN "contactCount",
DROP COLUMN "viewCount";

-- CreateTable
CREATE TABLE "ListingView" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingContact" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ListingView_listingId_userId_key" ON "ListingView"("listingId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ListingContact_listingId_userId_key" ON "ListingContact"("listingId", "userId");

-- AddForeignKey
ALTER TABLE "ListingView" ADD CONSTRAINT "ListingView_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingView" ADD CONSTRAINT "ListingView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingContact" ADD CONSTRAINT "ListingContact_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingContact" ADD CONSTRAINT "ListingContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

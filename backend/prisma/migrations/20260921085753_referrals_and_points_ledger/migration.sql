-- NOTE: hand-authored (not `prisma migrate dev`-generated) to avoid the
-- same schema-vs-hand-written-SQL drift as prior migrations proposing to
-- drop "Listing_movieName_trgm_idx"/"Listing_theaterLocation_idx"/
-- "TicketAlert_location_idx"/"TicketAlert_titleQuery_trgm_idx" - see
-- 20260830124200_geo_and_trgm_search and 20260902120000_delivery_method.
-- Content otherwise matches what Prisma would generate for this schema
-- diff, plus the referralCode backfill for pre-existing rows (Prisma's
-- diff can't generate data-dependent backfill SQL on its own).

-- CreateEnum
CREATE TYPE "PointsLedgerReason" AS ENUM ('REFERRAL_MILESTONE');

-- AlterTable: referralCode added nullable first so existing rows can be
-- backfilled before the NOT NULL + unique constraints are applied.
ALTER TABLE "User" ADD COLUMN "referralCode" TEXT,
ADD COLUMN "referredByUserId" TEXT,
ADD COLUMN "referralMilestoneThreshold" INTEGER NOT NULL DEFAULT 0;

-- Backfill a unique code for every pre-existing user. md5(random()::text ||
-- id) makes each row's input unique even if two calls landed in the same
-- clock tick, so a collision across rows is astronomically unlikely at
-- this table's size - new signups going forward use
-- lib/referral.ts's generateUniqueReferralCode, which checks the unique
-- constraint below and retries on the rare clash instead of assuming
-- uniqueness up front.
UPDATE "User" SET "referralCode" = upper(substr(md5(random()::text || id), 1, 8))
WHERE "referralCode" IS NULL;

ALTER TABLE "User" ALTER COLUMN "referralCode" SET NOT NULL;

-- A DB-level fallback default for any raw prisma.user.create() that
-- doesn't set referralCode itself (test fixtures, scripts) - real signups
-- (POST /api/auth/otp/verify) always call lib/referral.ts's
-- generateUniqueReferralCode explicitly instead of relying on this, since
-- that path checks the unique constraint and retries on a clash rather
-- than trusting random()+clock_timestamp() never collides.
ALTER TABLE "User" ALTER COLUMN "referralCode" SET DEFAULT upper(substr(md5((random())::text || (clock_timestamp())::text), 1, 8));

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredByUserId_fkey" FOREIGN KEY ("referredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PointsLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" "PointsLedgerReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsLedger_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PointsLedger" ADD CONSTRAINT "PointsLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

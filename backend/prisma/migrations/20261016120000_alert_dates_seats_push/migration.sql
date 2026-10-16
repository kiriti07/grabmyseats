-- Ticket alerts: dates, seats wanted, optional location, push notifications
-- (jobs/matchAlerts.ts, routes/alerts.ts, routes/pushTokens.ts).
-- Hand-trimmed from `prisma migrate diff`: the generated DROP INDEX lines for
-- the hand-written search indexes and the referralCode default change are
-- schema drift, not part of this change, and were removed (see
-- npm run check:migrations). Only additions, plus lat/lng becoming optional.

-- CreateEnum
CREATE TYPE "AlertNotificationStatus" AS ENUM ('PENDING', 'SENT', 'SENT_UNCONFIRMED', 'IN_APP_ONLY', 'SHOWN_ON_CREATE', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "PushDeliveryStatus" AS ENUM ('SENDING', 'SENT', 'SENT_UNCONFIRMED', 'RETRY', 'FAILED');

-- AlterTable: existing rows are matches already notified (by SMS, before
-- push) - they start as SENT so they're never pushed; new rows default to
-- PENDING.
ALTER TABLE "AlertNotification" ADD COLUMN "deliveryId" TEXT,
ADD COLUMN "seenAt" TIMESTAMP(3),
ADD COLUMN "status" "AlertNotificationStatus" NOT NULL DEFAULT 'SENT';
ALTER TABLE "AlertNotification" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable: existing alerts keep their lat/lng (radius matching), want
-- 1 seat, and match any date (no dates).
ALTER TABLE "TicketAlert" ADD COLUMN "dates" DATE[],
ADD COLUMN "seatsWanted" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "lat" DROP NOT NULL,
ALTER COLUMN "lng" DROP NOT NULL;

-- CreateTable
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "PushDeliveryStatus" NOT NULL DEFAULT 'SENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "matchCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "PushDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- CreateIndex
CREATE INDEX "PushToken_userId_idx" ON "PushToken"("userId");

-- CreateIndex
CREATE INDEX "PushDelivery_userId_createdAt_idx" ON "PushDelivery"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PushDelivery_status_idx" ON "PushDelivery"("status");

-- CreateIndex
CREATE INDEX "AlertNotification_status_notifiedAt_idx" ON "AlertNotification"("status", "notifiedAt");

-- AddForeignKey
ALTER TABLE "AlertNotification" ADD CONSTRAINT "AlertNotification_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "PushDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushDelivery" ADD CONSTRAINT "PushDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

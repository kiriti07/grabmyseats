-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isReviewAccount" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3);


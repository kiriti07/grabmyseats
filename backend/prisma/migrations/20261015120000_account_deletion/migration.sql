-- Account deletion (lib/accountDeletion.ts). Hand-trimmed from `prisma
-- migrate diff`: the generated DROP INDEX lines for the hand-written search
-- indexes and the referralCode default change are schema drift, not part of
-- this change, and were removed (see npm run check:migrations).

-- AlterTable
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DeletedIdentifier" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeletedIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeletedIdentifier_hash_key" ON "DeletedIdentifier"("hash");

-- CreateIndex
CREATE INDEX "DeletedIdentifier_createdAt_idx" ON "DeletedIdentifier"("createdAt");

-- AddForeignKey
ALTER TABLE "DeletedIdentifier" ADD CONSTRAINT "DeletedIdentifier_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FraudReport.reason (the report form's reason picker, POST
-- /api/fraud-reports) and User.termsAcceptedAt (set when an account is
-- created on a sign-up screen showing the Terms/Privacy consent line).
-- Purely additive: a new enum type, a nullable column, and a NOT NULL
-- column with a constant default. On PostgreSQL 11+ a constant default is
-- stored in the catalog, so existing FraudReport rows read as 'FRAUD'
-- without the table being rewritten; existing users stay NULL (nobody is
-- asked to accept again). No index, trigger or constraint is touched.
-- Generated schema-to-schema (`prisma migrate diff --from-schema
-- --to-schema`), so no drift DROPs for the hand-written indexes.

-- CreateEnum
CREATE TYPE "FraudReportReason" AS ENUM ('FRAUD', 'OFFENSIVE', 'HARASSMENT', 'OTHER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "FraudReport" ADD COLUMN     "reason" "FraudReportReason" NOT NULL DEFAULT 'FRAUD';

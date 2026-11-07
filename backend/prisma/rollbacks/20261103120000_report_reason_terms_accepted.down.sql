-- MANUAL ROLLBACK ONLY - never run automatically. Prisma does not read this
-- folder; `prisma migrate deploy` never runs it.
--
-- Reverses prisma/migrations/20261103120000_report_reason_terms_accepted.
--
-- WARNING: this permanently deletes data. Every report's reason and every
-- user's terms-acceptance time are lost, and cannot be recovered except from
-- a backup. Take a backup first.
--
-- Order:
--   1. Deploy backend code from before this migration (the newer code
--      reads both columns and fails without them).
--   2. Run this file once against the target database, inside a transaction.
--   3. Mark the migration rolled back so Prisma's history matches:
--      npx prisma migrate resolve --rolled-back 20261103120000_report_reason_terms_accepted
--
-- Drops only what that migration added. No index, constraint, trigger or
-- other column is touched.

BEGIN;

ALTER TABLE "FraudReport" DROP COLUMN "reason";
ALTER TABLE "User" DROP COLUMN "termsAcceptedAt";
DROP TYPE "FraudReportReason";

COMMIT;

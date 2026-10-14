import { prisma } from "../lib/prisma";
import { storageProvider } from "../lib/storage";

// How long a deleted account's fraud-prevention records are kept (stated on
// the public /delete-account page - change both together).
export const DELETED_ACCOUNT_RETENTION_YEARS = 3;

export interface PurgeResult {
  identifierHashes: number;
  suspensionRecords: number;
  reportsAgainst: number;
}

// Ends the retention lib/accountDeletion.ts keeps for a deleted account,
// once it was deleted more than DELETED_ACCOUNT_RETENTION_YEARS ago:
// - its DeletedIdentifier hashes (the email/phone may sign up again);
// - its suspension record (suspendedAt/suspensionReason);
// - fraud reports *against* it, with their evidence files.
// Reports it filed against other people stay: they're about someone else,
// and part of that person's record. Each delete is its own idempotent
// statement, so a failed or interrupted run just picks up next time.
export async function purgeDeletedAccountRecords(now: Date = new Date()): Promise<PurgeResult> {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - DELETED_ACCOUNT_RETENTION_YEARS);
  const expired = { deletedAt: { lt: cutoff } };

  const hashes = await prisma.deletedIdentifier.deleteMany({ where: { user: expired } });

  const suspensions = await prisma.user.updateMany({
    where: { ...expired, OR: [{ suspendedAt: { not: null } }, { suspensionReason: { not: null } }] },
    data: { suspendedAt: null, suspensionReason: null },
  });

  const reports = await prisma.fraudReport.findMany({
    where: { reportedUser: expired },
    select: { id: true, evidenceUrls: true },
  });
  for (const report of reports) {
    for (const url of report.evidenceUrls) {
      try {
        await storageProvider.delete(url);
      } catch (err) {
        console.error(`[jobs] couldn't delete evidence for fraud report ${report.id}`, err);
      }
    }
  }
  const deletedReports = await prisma.fraudReport.deleteMany({
    where: { id: { in: reports.map((r) => r.id) } },
  });

  return {
    identifierHashes: hashes.count,
    suspensionRecords: suspensions.count,
    reportsAgainst: deletedReports.count,
  };
}

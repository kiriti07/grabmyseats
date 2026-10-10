import { prisma } from "./prisma";

// One-time cleanup of what listings used to store about the ticket itself,
// before only a fingerprint was kept (lib/ticketFingerprint.ts):
//   - Listing.qrData: the raw barcode payload the client forwarded. Nothing
//     needs it, so it can be cleared at any time.
//   - Listing.screenshotUrl and the files behind it: public Cloudinary
//     uploads under grabmyseats/listings/ (that folder held nothing else).
//     A paid buyer can still be shown one (GET /api/transactions/:id/
//     screenshot), so this refuses while any listing that has one is
//     still upcoming or has a transaction a buyer may still need it for.
// Run via scripts/cleanupListingTicketMedia.ts; a dry run unless apply.

export const LEGACY_SCREENSHOT_PREFIX = "grabmyseats/listings/";

// Transactions whose buyer may still need the screenshot: paid but not yet
// settled, or under dispute.
const SCREENSHOT_STILL_NEEDED_TXN_STATUSES = ["ESCROWED", "BUYER_CONFIRMED", "DISPUTED"] as const;

export interface LegacyMediaStore {
  // Number of stored files under the prefix.
  count(prefix: string): Promise<number>;
  // Deletes every file under the prefix (and purges CDN caches); returns
  // how many were deleted.
  deleteByPrefix(prefix: string): Promise<number>;
}

export interface CleanupOptions {
  apply: boolean;
  qrData: boolean;
  screenshots: boolean;
  media: LegacyMediaStore;
  now?: Date;
  // Tests only: limit every query to these listings, so a test run against
  // a local database never touches its other rows.
  onlyListingIds?: string[];
}

export interface CleanupReport {
  qrDataRows: number;
  screenshotRows: number;
  screenshotFiles: number;
  // Why screenshots weren't touched, when they weren't.
  screenshotsBlockedBy: { upcomingListings: number; openTransactions: number } | null;
  applied: boolean;
}

export async function cleanupLegacyTicketMedia({
  apply,
  qrData,
  screenshots,
  media,
  now = new Date(),
  onlyListingIds,
}: CleanupOptions): Promise<CleanupReport> {
  const scope = onlyListingIds ? { id: { in: onlyListingIds } } : {};
  const withQrData = { ...scope, qrData: { not: null } };
  const withScreenshot = { ...scope, screenshotUrl: { not: null } };
  const report: CleanupReport = {
    qrDataRows: await prisma.listing.count({ where: withQrData }),
    screenshotRows: await prisma.listing.count({ where: withScreenshot }),
    screenshotFiles: 0,
    screenshotsBlockedBy: null,
    applied: apply,
  };

  if (qrData && apply) {
    await prisma.listing.updateMany({ where: withQrData, data: { qrData: null } });
  }

  if (screenshots) {
    report.screenshotFiles = await media.count(LEGACY_SCREENSHOT_PREFIX);
    const [upcomingListings, openTransactions] = await Promise.all([
      prisma.listing.count({ where: { ...withScreenshot, showtime: { gt: now } } }),
      prisma.transaction.count({
        where: {
          listing: withScreenshot,
          status: { in: [...SCREENSHOT_STILL_NEEDED_TXN_STATUSES] },
        },
      }),
    ]);
    if (upcomingListings > 0 || openTransactions > 0) {
      report.screenshotsBlockedBy = { upcomingListings, openTransactions };
    } else if (apply) {
      // Files first: if this stops halfway, the rows still point at what's
      // left and a rerun finishes the job.
      report.screenshotFiles = await media.deleteByPrefix(LEGACY_SCREENSHOT_PREFIX);
      await prisma.listing.updateMany({ where: withScreenshot, data: { screenshotUrl: null } });
    }
  }

  return report;
}

import "dotenv/config";
import { v2 as cloudinary } from "cloudinary";
import { prisma } from "../src/lib/prisma";
import { cleanupLegacyTicketMedia, type LegacyMediaStore } from "../src/lib/legacyTicketMedia";

// One-time cleanup of legacy Listing.qrData / Listing.screenshotUrl values
// and the Cloudinary files behind screenshotUrl - see
// src/lib/legacyTicketMedia.ts for what it does and when it refuses.
//
//   npx ts-node --transpile-only scripts/cleanupListingTicketMedia.ts [--qr-data] [--screenshots] [--apply]
//
// Without --apply it only reports what it would do. Prints the database and
// Cloudinary account first: check they are the ones you mean.

cloudinary.config();

const cloudinaryStore: LegacyMediaStore = {
  async count(prefix) {
    let total = 0;
    let next_cursor: string | undefined;
    do {
      const page = await cloudinary.api.resources({
        type: "upload",
        resource_type: "image",
        prefix,
        max_results: 500,
        next_cursor,
      });
      total += page.resources.length;
      next_cursor = page.next_cursor;
    } while (next_cursor);
    return total;
  },
  async deleteByPrefix(prefix) {
    let deleted = 0;
    // Up to 1000 per call; `partial` means there's more.
    for (;;) {
      const result = await cloudinary.api.delete_resources_by_prefix(prefix, {
        resource_type: "image",
        invalidate: true,
      });
      deleted += Object.values(result.deleted ?? {}).filter((v) => v === "deleted").length;
      if (!result.partial) return deleted;
    }
  },
};

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has("--apply");
  const qrData = args.has("--qr-data");
  const screenshots = args.has("--screenshots");
  if (!qrData && !screenshots) {
    throw new Error("Pass --qr-data and/or --screenshots (and --apply to actually change anything)");
  }

  const db = new URL(process.env.DATABASE_URL ?? "");
  console.log(`Database:   ${db.hostname}${db.pathname}`);
  console.log(`Cloudinary: ${cloudinary.config().cloud_name ?? "(not configured)"}`);
  console.log(apply ? "Mode:       APPLY" : "Mode:       dry run (pass --apply to change anything)");

  const report = await cleanupLegacyTicketMedia({ apply, qrData, screenshots, media: cloudinaryStore });

  if (qrData) {
    console.log(`qrData: ${report.qrDataRows} listing(s) ${apply ? "cleared" : "would be cleared"}`);
  }
  if (screenshots) {
    if (report.screenshotsBlockedBy) {
      const { upcomingListings, openTransactions } = report.screenshotsBlockedBy;
      console.log(
        `screenshots: NOT touched - ${upcomingListings} listing(s) with a screenshot are still upcoming and ` +
          `${openTransactions} transaction(s) on them are escrowed/confirmed/disputed; buyers may still need them. ` +
          "Run again once both are 0.",
      );
    } else {
      console.log(
        `screenshots: ${report.screenshotFiles} file(s) and ${report.screenshotRows} listing URL(s) ` +
          (apply ? "deleted/cleared" : "would be deleted/cleared"),
      );
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

import "dotenv/config";
import fs from "node:fs";
import { prisma } from "../src/lib/prisma";
import { decodeTicketCodes } from "../src/lib/ticketBarcode";
import { ticketFingerprint } from "../src/lib/ticketFingerprint";

// Admin support tool: which listings hold this ticket? Decodes a booking
// screenshot the way POST /api/listings does, prints each code's
// fingerprint, and lists every listing (any status) with that fingerprint.
// Needs the same TICKET_FINGERPRINT_SECRET as the environment it queries.
//
//   npx ts-node --transpile-only scripts/ticketFingerprint.ts <image>
//
// To free a ticket held by a live listing: withdraw that listing if it's the
// problem (only frees it when no seats were sold), or keep the listing and
//   UPDATE "Listing" SET "ticketFingerprint" = NULL WHERE id = '<listingId>';

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: scripts/ticketFingerprint.ts <image>");

  const db = new URL(process.env.DATABASE_URL ?? "");
  console.log(`Database: ${db.hostname}${db.pathname}`);

  const codes = await decodeTicketCodes(fs.readFileSync(file));
  if (codes.length === 0) {
    console.log("No ticket barcode/QR code found in this image.");
    return;
  }

  for (const code of codes) {
    const fingerprint = ticketFingerprint(code.text);
    console.log(`\n${code.format} -> fingerprint ${fingerprint}`);
    const listings = await prisma.listing.findMany({
      where: { ticketFingerprint: fingerprint },
      select: {
        id: true,
        status: true,
        sellerId: true,
        totalSeats: true,
        availableSeats: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
    if (listings.length === 0) console.log("  no listings");
    for (const l of listings) {
      console.log(
        `  ${l.id}  ${l.status}  seller ${l.sellerId}  seats ${l.availableSeats}/${l.totalSeats} available  created ${l.createdAt.toISOString()}`,
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

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ListingStatus } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { expireListings } from "./expireListings";

// End-to-end coverage against the real local Postgres - not mocked.
//
// Every call below pins expireListings' `asOf` cutoff to 2001 rather than
// letting it default to now. The job is a single bulk UPDATE over the
// whole Listing table and vitest runs test files in parallel against one
// shared database, so a default-cutoff run from here would also expire
// other files' fixtures - suspension.test.ts, transactionCheckInFlow.test.ts,
// deliveryMethod.test.ts and whatsapp.test.ts all create ACTIVE listings
// with showtime = now, and at least suspension.test.ts then asserts its
// listing is still visible in search (which filters on ACTIVE/
// PARTIALLY_SOLD). Pinning the cutoff to a date two decades before any
// other fixture keeps this file's writes to this file's own rows.
describe("expireListings", () => {
  const LAT = 12.9716;
  const LNG = 77.5946;

  // A timeline entirely in the past, so "before"/"after" here are relative
  // to CUTOFF rather than to the wall clock.
  const CUTOFF = new Date("2001-06-01T00:00:00.000Z");
  const BEFORE_CUTOFF = new Date("2001-01-01T00:00:00.000Z"); // showtime has passed
  const AFTER_CUTOFF = new Date("2001-12-01T00:00:00.000Z"); // showtime still upcoming

  let sellerId: string;
  const listingIds: string[] = [];

  beforeAll(async () => {
    const seller = await prisma.user.create({
      data: { phone: `+1555explseller${randomUUID()}`.slice(0, 30) },
    });
    sellerId = seller.id;
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
    await prisma.user.delete({ where: { id: sellerId } });
  });

  async function createListing(status: ListingStatus, showtime: Date) {
    const listing = await prisma.listing.create({
      data: {
        sellerId,
        movieName: "Expire Listings Test Movie",
        theaterName: "Expire Listings Test Theater",
        theaterLat: LAT,
        theaterLng: LNG,
        showtime,
        bookingId: `EXPLIST${randomUUID()}`.slice(0, 20),
        totalSeats: 2,
        availableSeats: 2,
        pricePerSeat: 200,
        status,
      },
    });
    listingIds.push(listing.id);
    return listing.id;
  }

  async function statusOf(listingId: string) {
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
    return listing.status;
  }

  it("expires an ACTIVE listing whose showtime has passed", async () => {
    const listingId = await createListing("ACTIVE", BEFORE_CUTOFF);

    await expireListings(CUTOFF);

    expect(await statusOf(listingId)).toBe("EXPIRED");
  });

  it("expires a PARTIALLY_SOLD listing whose showtime has passed", async () => {
    const listingId = await createListing("PARTIALLY_SOLD", BEFORE_CUTOFF);

    await expireListings(CUTOFF);

    expect(await statusOf(listingId)).toBe("EXPIRED");
  });

  it("leaves a SOLD listing with a past showtime untouched", async () => {
    const listingId = await createListing("SOLD", BEFORE_CUTOFF);

    await expireListings(CUTOFF);

    expect(await statusOf(listingId)).toBe("SOLD");
  });

  it("leaves a WITHDRAWN listing with a past showtime untouched", async () => {
    const listingId = await createListing("WITHDRAWN", BEFORE_CUTOFF);

    await expireListings(CUTOFF);

    expect(await statusOf(listingId)).toBe("WITHDRAWN");
  });

  it("leaves an ACTIVE listing whose showtime hasn't passed yet untouched", async () => {
    const listingId = await createListing("ACTIVE", AFTER_CUTOFF);

    await expireListings(CUTOFF);

    expect(await statusOf(listingId)).toBe("ACTIVE");
  });

  it("sweeps every eligible listing in one run, and leaves the ineligible ones alone", async () => {
    const [activePast, partiallySoldPast, soldPast, withdrawnPast, activeFuture] =
      await Promise.all([
        createListing("ACTIVE", BEFORE_CUTOFF),
        createListing("PARTIALLY_SOLD", BEFORE_CUTOFF),
        createListing("SOLD", BEFORE_CUTOFF),
        createListing("WITHDRAWN", BEFORE_CUTOFF),
        createListing("ACTIVE", AFTER_CUTOFF),
      ]);

    await expireListings(CUTOFF);

    expect(await statusOf(activePast)).toBe("EXPIRED");
    expect(await statusOf(partiallySoldPast)).toBe("EXPIRED");
    expect(await statusOf(soldPast)).toBe("SOLD");
    expect(await statusOf(withdrawnPast)).toBe("WITHDRAWN");
    expect(await statusOf(activeFuture)).toBe("ACTIVE");
  });

  it("is idempotent - a second run neither re-expires nor disturbs an already-EXPIRED listing", async () => {
    const listingId = await createListing("ACTIVE", BEFORE_CUTOFF);

    await expireListings(CUTOFF);
    expect(await statusOf(listingId)).toBe("EXPIRED");

    // The status IN ('ACTIVE', 'PARTIALLY_SOLD') guard is what makes the
    // job safe to run on a schedule forever: an already-expired row can't
    // match a second time, so this run updates nothing at all.
    const secondRunCount = await expireListings(CUTOFF);
    expect(secondRunCount).toBe(0);
    expect(await statusOf(listingId)).toBe("EXPIRED");
  });
});

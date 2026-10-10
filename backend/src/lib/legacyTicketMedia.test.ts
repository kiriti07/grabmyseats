import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "./prisma";
import { LEGACY_SCREENSHOT_PREFIX, cleanupLegacyTicketMedia, type LegacyMediaStore } from "./legacyTicketMedia";

// The one-time qrData/screenshotUrl cleanup (scripts/cleanupListingTicketMedia.ts),
// scoped to this file's own listings (onlyListingIds) so it never touches
// any other row of the local database. Cloudinary is a fake.
describe("cleanupLegacyTicketMedia", () => {
  let sellerId: string;
  let buyerId: string;
  const ids: string[] = [];
  const DAY = 24 * 60 * 60 * 1000;

  function fakeMedia(files = 3) {
    let remaining = files;
    const media: LegacyMediaStore = {
      count: vi.fn(async () => remaining),
      deleteByPrefix: vi.fn(async () => {
        const n = remaining;
        remaining = 0;
        return n;
      }),
    };
    return media;
  }

  async function legacyListing(showtime: Date) {
    const listing = await prisma.listing.create({
      data: {
        sellerId,
        movieName: "Legacy Media Movie",
        theaterName: "Legacy Media Cinemas",
        theaterLat: 17.44,
        theaterLng: 78.35,
        showtime,
        bookingId: `LEG${randomUUID()}`.slice(0, 20),
        totalSeats: 1,
        availableSeats: 1,
        pricePerSeat: 100,
        qrData: `LEGACY${randomUUID()}`,
        screenshotUrl: `https://res.cloudinary.com/demo/image/upload/${LEGACY_SCREENSHOT_PREFIX}${randomUUID()}.jpg`,
      },
    });
    ids.push(listing.id);
    return listing;
  }

  beforeAll(async () => {
    const seller = await prisma.user.create({ data: { email: `legacy-s-${randomUUID()}@example.com` } });
    const buyer = await prisma.user.create({ data: { email: `legacy-b-${randomUUID()}@example.com` } });
    sellerId = seller.id;
    buyerId = buyer.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { listingId: { in: ids } } });
    await prisma.listing.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: [sellerId, buyerId] } } });
  });

  async function rows() {
    return prisma.listing.findMany({ where: { id: { in: ids } }, select: { qrData: true, screenshotUrl: true } });
  }

  it("dry run reports and changes nothing", async () => {
    await legacyListing(new Date(Date.now() - 30 * DAY));
    const media = fakeMedia();
    const report = await cleanupLegacyTicketMedia({
      apply: false,
      qrData: true,
      screenshots: true,
      media,
      onlyListingIds: ids,
    });
    expect(report).toMatchObject({ qrDataRows: 1, screenshotRows: 1, screenshotFiles: 3, screenshotsBlockedBy: null });
    expect(media.deleteByPrefix).not.toHaveBeenCalled();
    expect((await rows()).every((r) => r.qrData && r.screenshotUrl)).toBe(true);
  });

  it("qrData is cleared straight away; screenshots wait while a buyer may still need one", async () => {
    const upcoming = await legacyListing(new Date(Date.now() + 2 * DAY));
    const media = fakeMedia();
    const report = await cleanupLegacyTicketMedia({
      apply: true,
      qrData: true,
      screenshots: true,
      media,
      onlyListingIds: ids,
    });
    expect(report.screenshotsBlockedBy).toEqual({ upcomingListings: 1, openTransactions: 0 });
    expect(media.deleteByPrefix).not.toHaveBeenCalled();
    expect((await rows()).every((r) => r.qrData === null && r.screenshotUrl !== null)).toBe(true);

    // Show over, but the buyer's payment is still in escrow: still blocked.
    await prisma.listing.update({ where: { id: upcoming.id }, data: { showtime: new Date(Date.now() - DAY) } });
    const txn = await prisma.transaction.create({
      data: { listingId: upcoming.id, buyerId, seatsCount: 1, amountPaid: 100, status: "ESCROWED" },
    });
    const blocked = await cleanupLegacyTicketMedia({
      apply: true,
      qrData: false,
      screenshots: true,
      media,
      onlyListingIds: ids,
    });
    expect(blocked.screenshotsBlockedBy).toEqual({ upcomingListings: 0, openTransactions: 1 });

    // Settled: the files go, then the URLs.
    await prisma.transaction.update({ where: { id: txn.id }, data: { status: "PAYOUT_RELEASED" } });
    const done = await cleanupLegacyTicketMedia({
      apply: true,
      qrData: false,
      screenshots: true,
      media,
      onlyListingIds: ids,
    });
    expect(done.screenshotsBlockedBy).toBeNull();
    expect(media.deleteByPrefix).toHaveBeenCalledWith("grabmyseats/listings/");
    expect(done.screenshotFiles).toBe(3);
    expect((await rows()).every((r) => r.qrData === null && r.screenshotUrl === null)).toBe(true);
  });
});

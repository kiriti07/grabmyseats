import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { issueSessionToken } from "../lib/session";

// Regression test for a timezone bug: a seller entering "20/09/2026, 22:30"
// in the Sell form's Showtime field saw the listing displayed back as
// "Sun 21 Sept, 4:00" - a +5:30 (IST) shift. The root cause was entirely on
// the frontend display side (frontend/src/lib/format.ts was formatting the
// stored ISO string via `toLocaleString(undefined, {...})` with no
// `timeZone` pinned, which lets the *viewer's* browser reinterpret a value
// that has no real timezone - see that file's own comment and
// frontend/src/lib/format.test.ts for the display-side regression test).
//
// This suite locks down the backend half of the same round-trip, which the
// frontend fix depends on staying a clean passthrough: whatever ISO string
// the sell form sends as `showtime` (produced by
// frontend/src/lib/datetimeLocal.ts's datetimeLocalValueToIso - a literal
// string concatenation, no Date math) must come back byte-for-byte
// identical from Prisma, from Postgres, and from every endpoint that
// serializes a listing - regardless of the DB server's or the Node
// process's own timezone. That's only true because the `showtime` column
// is a timezone-naive `TIMESTAMP(3)` (prisma/schema.prisma) and
// serialize.ts's `listing.showtime.toISOString()` never re-expresses it in
// another zone. If either of those ever changed, this test would catch the
// drift before it reached a seller's listing card.
describe("showtime round-trips exactly, with no timezone drift", () => {
  const LAT = 12.9716;
  const LNG = 77.5946;

  // Exactly the case from the bug report.
  const SHOWTIME_ISO = "2026-09-20T22:30:00.000Z";

  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );

  let sellerId: string;
  let sellerToken: string;
  const listingIds: string[] = [];

  beforeAll(async () => {
    const suffix = randomUUID();
    const seller = await prisma.user.create({
      data: { phone: `+1555showtime${suffix}`.slice(0, 30), name: "Test Seller" },
    });
    sellerId = seller.id;
    sellerToken = await issueSessionToken(seller);
  });

  afterAll(async () => {
    await prisma.listingView.deleteMany({ where: { listingId: { in: listingIds } } });
    await prisma.listingContact.deleteMany({ where: { listingId: { in: listingIds } } });
    await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
    await prisma.user.delete({ where: { id: sellerId } });
  });

  it("stores and returns the exact showtime sent on creation - Prisma, GET /:id, and GET /mine all agree", async () => {
    const created = await request(app)
      .post("/api/listings")
      .set("Authorization", `Bearer ${sellerToken}`)
      .field("movieName", "Showtime Round Trip Test")
      .field("theaterName", "Showtime Round Trip Theater")
      .field("bookingId", `SHOWTIME${randomUUID()}`.slice(0, 20))
      .field("totalSeats", "1")
      .field("pricePerSeat", "200")
      .field("showtime", SHOWTIME_ISO)
      .field("theaterLat", String(LAT))
      .field("theaterLng", String(LNG))
      .attach("screenshot", onePixelPng, { filename: "test.png", contentType: "image/png" });

    expect(created.status).toBe(201);
    expect(created.body.data.listing.showtime).toBe(SHOWTIME_ISO);
    const listingId = created.body.data.listing.id;
    listingIds.push(listingId);

    // The Prisma/Postgres round trip itself, not just the JSON serializer:
    // read the row straight back and confirm the stored instant is
    // identical - not shifted by the DB server's or this process's own
    // timezone.
    const stored = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(stored.showtime.toISOString()).toBe(SHOWTIME_ISO);

    const detail = await request(app)
      .get(`/api/listings/${listingId}`)
      .set("Authorization", `Bearer ${sellerToken}`);
    expect(detail.body.data.listing.showtime).toBe(SHOWTIME_ISO);

    const mine = await request(app)
      .get("/api/listings/mine")
      .set("Authorization", `Bearer ${sellerToken}`);
    const found = mine.body.data.listings.find((l: { id: string }) => l.id === listingId);
    expect(found.showtime).toBe(SHOWTIME_ISO);
  });

  it("PATCH-updating showtime round-trips the new value exactly too", async () => {
    const created = await request(app)
      .post("/api/listings")
      .set("Authorization", `Bearer ${sellerToken}`)
      .field("movieName", "Showtime Edit Round Trip Test")
      .field("theaterName", "Showtime Edit Round Trip Theater")
      .field("bookingId", `SHOWTIMEEDIT${randomUUID()}`.slice(0, 20))
      .field("totalSeats", "1")
      .field("pricePerSeat", "200")
      .field("showtime", new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
      .field("theaterLat", String(LAT))
      .field("theaterLng", String(LNG))
      .attach("screenshot", onePixelPng, { filename: "test.png", contentType: "image/png" });
    const listingId = created.body.data.listing.id;
    listingIds.push(listingId);

    // A distinct wall-clock value from the create-time one above, so this
    // isn't just re-verifying the same instant.
    const NEW_SHOWTIME_ISO = "2026-09-22T09:15:00.000Z";
    const patched = await request(app)
      .patch(`/api/listings/${listingId}`)
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({ showtime: NEW_SHOWTIME_ISO });

    expect(patched.status).toBe(200);
    expect(patched.body.data.listing.showtime).toBe(NEW_SHOWTIME_ISO);

    const stored = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(stored.showtime.toISOString()).toBe(NEW_SHOWTIME_ISO);
  });
});

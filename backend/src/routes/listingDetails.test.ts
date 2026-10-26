import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { LISTING_DESCRIPTION_CONTACT_MESSAGE } from "@grabmyseats/shared";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { issueSessionToken } from "../lib/session";
import { ticketImage } from "../test/ticketImage";
import { FakePushSender } from "../test/fakePushSender";
import { alertMatchingIdle, matchAlerts, setInstantMatchRunner } from "../jobs/matchAlerts";

// Seat type and description on listings (shared/src/listingDetails.ts),
// end to end through the real app and local Postgres: validation on create
// and edit, that they're stored, that every listing response carries them,
// that old rows come back null, and that editing only them never re-runs
// alert matching.
describe("listing seat type and description", () => {
  const LAT = 12.9716;
  const LNG = 77.5946;
  const userIds: string[] = [];
  const listingIds: string[] = [];
  const txnIds: string[] = [];
  let sellerId: string;
  let sellerToken: string;
  let buyerId: string;
  let buyerToken: string;
  let matchRuns: string[];

  // A made-up title per test, so search finds only this test's listing.
  const title = () => `Seat Details ${randomUUID().slice(0, 8).replace(/[0-9-]/g, "q")}`;

  beforeAll(async () => {
    const seller = await prisma.user.create({
      data: {
        email: `sd-seller-${randomUUID()}@example.com`,
        emailVerifiedAt: new Date(),
        phone: `+1555sds${randomUUID()}`.slice(0, 30),
        name: "Seller",
      },
    });
    const buyer = await prisma.user.create({
      data: {
        email: `sd-buyer-${randomUUID()}@example.com`,
        emailVerifiedAt: new Date(),
        phone: `+1555sdb${randomUUID()}`.slice(0, 30),
        name: "Buyer",
      },
    });
    userIds.push(seller.id, buyer.id);
    sellerId = seller.id;
    sellerToken = await issueSessionToken(seller);
    buyerId = buyer.id;
    buyerToken = await issueSessionToken(buyer);
  });

  beforeAll(() => {
    // Records which listings instant matching ran for; the run itself is
    // limited to this suite's buyer, who has no alerts.
    matchRuns = [];
    const push = new FakePushSender();
    setInstantMatchRunner(async (listingId) => {
      matchRuns.push(listingId);
      return matchAlerts({ listingIds: [listingId], userIds: [buyerId], sender: push });
    });
  });

  afterEach(async () => {
    await alertMatchingIdle();
  });

  afterAll(async () => {
    setInstantMatchRunner(null);
    await prisma.transaction.deleteMany({ where: { id: { in: txnIds } } });
    await prisma.listingView.deleteMany({ where: { listingId: { in: listingIds } } });
    await prisma.listingContact.deleteMany({ where: { listingId: { in: listingIds } } });
    await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function post(fields: Record<string, string>, movieName = title()) {
    let req = request(app)
      .post("/api/listings")
      .set("Authorization", `Bearer ${sellerToken}`)
      .field("movieName", movieName)
      .field("theaterName", "Seat Details Test Venue")
      .field("city", "Bengaluru")
      .field("bookingId", `SD${randomUUID()}`.slice(0, 20))
      .field("totalSeats", "2")
      .field("pricePerSeat", "200")
      .field("showtime", new Date(Date.now() + 2 * 86_400_000).toISOString())
      .field("theaterLat", String(LAT))
      .field("theaterLng", String(LNG));
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    const res = await req.attach("screenshot", await ticketImage(), {
      filename: "ticket.png",
      contentType: "image/png",
    });
    if (res.body?.data?.listing?.id) listingIds.push(res.body.data.listing.id);
    return res;
  }

  const patch = (id: string, body: Record<string, unknown>) =>
    request(app).patch(`/api/listings/${id}`).set("Authorization", `Bearer ${sellerToken}`).send(body);

  async function seedListing(
    data: { category?: "MOVIE" | "EVENT" | "SPORT"; seatType?: string; description?: string } = {},
  ) {
    const listing = await prisma.listing.create({
      data: {
        sellerId,
        movieName: title(),
        theaterName: "Seat Details Seed Venue",
        theaterLat: LAT,
        theaterLng: LNG,
        showtime: new Date(Date.now() + 2 * 86_400_000),
        bookingId: `SDSEED${randomUUID()}`.slice(0, 20),
        totalSeats: 2,
        availableSeats: 2,
        pricePerSeat: 200,
        ...data,
      },
    });
    listingIds.push(listing.id);
    return listing;
  }

  describe("POST /api/listings", () => {
    it("stores and returns seat type and normalized description", async () => {
      const res = await post({ category: "MOVIE", seatType: "RECLINER", description: "  Corner  seats\n aisle " });
      expect(res.status).toBe(201);
      expect(res.body.data.listing.seatType).toBe("RECLINER");
      expect(res.body.data.listing.description).toBe("Corner seats aisle");
      const row = await prisma.listing.findUniqueOrThrow({ where: { id: res.body.data.listing.id } });
      expect(row.seatType).toBe("RECLINER");
      expect(row.description).toBe("Corner seats aisle");
    });

    it("leaves both null when not sent, or sent empty (skip)", async () => {
      const none = await post({});
      expect(none.status).toBe(201);
      expect(none.body.data.listing.seatType).toBeNull();
      expect(none.body.data.listing.description).toBeNull();

      const skipped = await post({ seatType: "", description: "   " });
      expect(skipped.status).toBe(201);
      expect(skipped.body.data.listing.seatType).toBeNull();
      expect(skipped.body.data.listing.description).toBeNull();
    });

    it("accepts a description on Events and Sports", async () => {
      const res = await post({ category: "SPORT", description: "North stand, block C" });
      expect(res.status).toBe(201);
      expect(res.body.data.listing.description).toBe("North stand, block C");
    });

    it("rejects an unknown seat type, and any seat type outside Movies, creating nothing", async () => {
      for (const fields of <Record<string, string>[]>[
        { seatType: "BALCONY" },
        { seatType: "recliner" },
        { category: "EVENT", seatType: "RECLINER" },
      ]) {
        const movieName = title();
        const res = await post(fields, movieName);
        expect(res.status, JSON.stringify(fields)).toBe(400);
        expect(await prisma.listing.count({ where: { movieName } })).toBe(0);
      }
    });

    it("rejects a description over 300 characters", async () => {
      const ok = await post({ description: "x".repeat(300) });
      expect(ok.status).toBe(201);
      const res = await post({ description: "x".repeat(301) });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("300 characters");
    });

    it("rejects phone numbers, emails and links with the contact-details message", async () => {
      for (const description of ["Call 98765 43210", "priya@example.com", "https://example.com", "www.seats.in"]) {
        const res = await post({ description });
        expect(res.status, description).toBe(400);
        expect(res.body.error).toBe(LISTING_DESCRIPTION_CONTACT_MESSAGE);
      }
    });

    it("stores HTML/script text verbatim as plain text and returns it as a JSON string", async () => {
      const xss = `<script>alert(1)</script><img src=x onerror="alert(2)">`;
      const res = await post({ description: xss });
      expect(res.status).toBe(201);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(res.body.data.listing.description).toBe(xss);
    });
  });

  describe("every listing response carries the fields", () => {
    it("search, detail, mine and transaction detail - and an old listing comes back null", async () => {
      const withExtras = await seedListing({ seatType: "TOP_ROW", description: "Aisle seats" });
      const old = await seedListing();

      const search = await request(app)
        .get("/api/listings/search")
        .set("Authorization", `Bearer ${buyerToken}`)
        .query({ lat: LAT, lng: LNG, movieName: withExtras.movieName });
      const hit = search.body.data.listings.find((l: { id: string }) => l.id === withExtras.id);
      expect(hit).toMatchObject({ seatType: "TOP_ROW", description: "Aisle seats" });

      const oldSearch = await request(app)
        .get("/api/listings/search")
        .set("Authorization", `Bearer ${buyerToken}`)
        .query({ lat: LAT, lng: LNG, movieName: old.movieName });
      const oldHit = oldSearch.body.data.listings.find((l: { id: string }) => l.id === old.id);
      expect(oldHit).toMatchObject({ seatType: null, description: null });

      const detail = await request(app)
        .get(`/api/listings/${withExtras.id}`)
        .set("Authorization", `Bearer ${buyerToken}`);
      expect(detail.body.data.listing).toMatchObject({ seatType: "TOP_ROW", description: "Aisle seats" });
      const oldDetail = await request(app).get(`/api/listings/${old.id}`).set("Authorization", `Bearer ${buyerToken}`);
      expect(oldDetail.body.data.listing).toMatchObject({ seatType: null, description: null });

      const mine = await request(app).get("/api/listings/mine").set("Authorization", `Bearer ${sellerToken}`);
      const mineRow = mine.body.data.listings.find((l: { id: string }) => l.id === withExtras.id);
      expect(mineRow).toMatchObject({ seatType: "TOP_ROW", description: "Aisle seats" });

      const txn = await prisma.transaction.create({
        data: { listingId: withExtras.id, buyerId, seatsCount: 1, amountPaid: 200, status: "RESERVED" },
      });
      txnIds.push(txn.id);
      const txnDetail = await request(app).get(`/api/transactions/${txn.id}`).set("Authorization", `Bearer ${buyerToken}`);
      expect(txnDetail.status).toBe(200);
      expect(txnDetail.body.data.listing).toMatchObject({ seatType: "TOP_ROW", description: "Aisle seats" });
    });
  });

  describe("PATCH /api/listings/:id", () => {
    it("sets, changes and clears seat type and description", async () => {
      const listing = await seedListing();

      const set = await patch(listing.id, { seatType: "BOTTOM_ROW", description: " Middle  seats " });
      expect(set.status).toBe(200);
      expect(set.body.data.listing).toMatchObject({ seatType: "BOTTOM_ROW", description: "Middle seats" });

      const cleared = await patch(listing.id, { seatType: null, description: "" });
      expect(cleared.status).toBe(200);
      const row = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
      expect(row.seatType).toBeNull();
      expect(row.description).toBeNull();
    });

    it("leaves fields it isn't sent alone", async () => {
      const listing = await seedListing({ seatType: "RECLINER", description: "Aisle seats" });
      expect((await patch(listing.id, { pricePerSeat: 150 })).status).toBe(200);
      const row = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
      expect(row).toMatchObject({ pricePerSeat: 150, seatType: "RECLINER", description: "Aisle seats" });
    });

    it("rejects invalid values and changes nothing", async () => {
      const listing = await seedListing({ seatType: "RECLINER", description: "Aisle seats" });
      const event = await seedListing({ category: "EVENT" });

      for (const [id, body] of [
        [listing.id, { seatType: "BALCONY" }],
        [event.id, { seatType: "RECLINER" }],
        [listing.id, { description: "x".repeat(301) }],
        [listing.id, { description: "wa.me/919999999999" }],
        [listing.id, { description: 42 }],
        [listing.id, { pricePerSeat: 150, description: "mail me a@b.co" }],
      ] as const) {
        const res = await patch(id, body);
        expect(res.status, JSON.stringify(body)).toBe(400);
      }
      const row = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
      expect(row).toMatchObject({ pricePerSeat: 200, seatType: "RECLINER", description: "Aisle seats" });
    });

    it("still requires the seller", async () => {
      const listing = await seedListing();
      const res = await request(app)
        .patch(`/api/listings/${listing.id}`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({ description: "Mine now" });
      expect(res.status).toBe(403);
    });

    it("editing only seat type / description - or resending an unchanged showtime - never re-runs alert matching", async () => {
      const listing = await seedListing();
      matchRuns.length = 0;

      expect((await patch(listing.id, { seatType: "TOP_ROW" })).status).toBe(200);
      await alertMatchingIdle();
      expect((await patch(listing.id, { description: "Corner seats" })).status).toBe(200);
      await alertMatchingIdle();
      // What an older My Listings form sends on every save.
      expect(
        (
          await patch(listing.id, {
            pricePerSeat: 200,
            showtime: listing.showtime.toISOString(),
            totalSeats: 2,
            description: "Corner seats, aisle",
          })
        ).status,
      ).toBe(200);
      await alertMatchingIdle();
      expect(matchRuns).toEqual([]);

      // An actual showtime change still does.
      const later = new Date(listing.showtime.getTime() + 86_400_000).toISOString();
      expect((await patch(listing.id, { showtime: later })).status).toBe(200);
      await alertMatchingIdle();
      expect(matchRuns).toEqual([listing.id]);
    });
  });
});

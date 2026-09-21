import "dotenv/config";
import { randomUUID } from "node:crypto";
import type { Express } from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { issueSessionToken } from "../lib/session";

// Deduplicated, per-user view/contact tracking (see ListingView/
// ListingContact in schema.prisma, and toListingDetail/toMyListing in
// lib/serialize.ts). Both counts are derived from row counts - a unique
// constraint on (listingId, userId) is what actually enforces "one view/
// contact per user per listing", not just this test suite's expectations.
describe("listing view tracking", () => {
  const LAT = 12.9716;
  const LNG = 77.5946;

  let sellerId: string;
  let sellerToken: string;
  let viewer1Id: string;
  let viewer1Token: string;
  let viewer2Id: string;
  let viewer2Token: string;
  let listingId: string;

  beforeAll(async () => {
    const suffix = randomUUID();
    const seller = await prisma.user.create({
      data: { phone: `+1555countseller${suffix}`.slice(0, 30), name: "Count Test Seller" },
    });
    const viewer1 = await prisma.user.create({
      data: { phone: `+1555countviewer1${suffix}`.slice(0, 30) },
    });
    const viewer2 = await prisma.user.create({
      data: { phone: `+1555countviewer2${suffix}`.slice(0, 30) },
    });
    sellerId = seller.id;
    sellerToken = await issueSessionToken(seller);
    viewer1Id = viewer1.id;
    viewer1Token = await issueSessionToken(viewer1);
    viewer2Id = viewer2.id;
    viewer2Token = await issueSessionToken(viewer2);

    const listing = await prisma.listing.create({
      data: {
        sellerId,
        movieName: "View Count Test Movie",
        theaterName: "View Count Test Theater",
        theaterLat: LAT,
        theaterLng: LNG,
        showtime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        bookingId: `VIEWCOUNT${suffix}`.slice(0, 20),
        totalSeats: 3,
        availableSeats: 3,
        pricePerSeat: 300,
      },
    });
    listingId = listing.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { listingId } });
    // Scoped by listingId (not userId) - removes every view/contact row
    // this describe block created, for any of the three users below, so
    // deleting those users afterward never trips the FK constraint.
    await prisma.listingView.deleteMany({ where: { listingId } });
    await prisma.listingContact.deleteMany({ where: { listingId } });
    await prisma.listing.delete({ where: { id: listingId } });
    await prisma.user.deleteMany({ where: { id: { in: [sellerId, viewer1Id, viewer2Id] } } });
  });

  it("requires authentication - no token is a 401, not a public view", async () => {
    const res = await request(app).get(`/api/listings/${listingId}`);
    expect(res.status).toBe(401);
  });

  it("the seller viewing their own listing is never recorded as a view", async () => {
    const res = await request(app)
      .get(`/api/listings/${listingId}`)
      .set("Authorization", `Bearer ${sellerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.listing.viewCount).toBe(0);

    const rows = await prisma.listingView.findMany({ where: { listingId, userId: sellerId } });
    expect(rows).toHaveLength(0);
  });

  it("viewing as the same user twice does not increase viewCount", async () => {
    const first = await request(app)
      .get(`/api/listings/${listingId}`)
      .set("Authorization", `Bearer ${viewer1Token}`);
    expect(first.status).toBe(200);
    expect(first.body.data.listing.viewCount).toBe(1);

    const second = await request(app)
      .get(`/api/listings/${listingId}`)
      .set("Authorization", `Bearer ${viewer1Token}`);
    expect(second.status).toBe(200);
    expect(second.body.data.listing.viewCount).toBe(1);

    // Same guarantee at the row level, not just the serialized count -
    // the unique constraint on (listingId, userId) is the actual source
    // of truth.
    const rows = await prisma.listingView.findMany({ where: { listingId, userId: viewer1Id } });
    expect(rows).toHaveLength(1);
  });

  it("viewing as a second, different user does increase viewCount", async () => {
    const res = await request(app)
      .get(`/api/listings/${listingId}`)
      .set("Authorization", `Bearer ${viewer2Token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.listing.viewCount).toBe(2);
  });

  it("the counts appear in the public (buyer-facing) detail response - not seller-only", async () => {
    const res = await request(app)
      .get(`/api/listings/${listingId}`)
      .set("Authorization", `Bearer ${viewer1Token}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.data.listing.viewCount).toBe("number");
    expect(typeof res.body.data.listing.contactCount).toBe("number");
    expect(res.body.data.listing.contactCount).toBe(0);
  });

  it("never exposes viewCount or contactCount on GET /api/listings/search results", async () => {
    const res = await request(app).get("/api/listings/search").query({ lat: LAT, lng: LNG });
    expect(res.status).toBe(200);
    const found = res.body.data.listings.find((l: { id: string }) => l.id === listingId);
    expect(found).toBeDefined();
    expect(found.viewCount).toBeUndefined();
    expect(found.contactCount).toBeUndefined();
  });

  it("exposes both counts to the seller on GET /api/listings/mine, matching the public detail values", async () => {
    const res = await request(app)
      .get("/api/listings/mine")
      .set("Authorization", `Bearer ${sellerToken}`);
    expect(res.status).toBe(200);
    const found = res.body.data.listings.find((l: { id: string }) => l.id === listingId);
    expect(found).toBeDefined();
    // Exactly 2 - both distinct viewers above, no more (repeat view was a no-op).
    expect(found.viewCount).toBe(2);
    expect(found.contactCount).toBe(0);
  });
});

// contactCount only ever increments in contact_only mode (the escrow
// branch of POST /:id/reserve never sets `contact` at all) - same
// module-reload pattern as contactOnlyMode.test.ts, since PAYMENT_MODE is
// read once at module load (lib/config.ts).
describe("contactCount tracking (contact_only mode)", () => {
  const LAT = 12.9716;
  const LNG = 77.5946;

  let contactOnlyApp: Express;
  let sellerId: string;
  let sellerToken: string;
  let buyerId: string;
  let buyerToken: string;
  let listingId: string;

  beforeAll(async () => {
    vi.stubEnv("PAYMENT_MODE", "contact_only");
    vi.resetModules();
    ({ app: contactOnlyApp } = await import("../app"));

    const suffix = randomUUID();
    const seller = await prisma.user.create({
      data: { phone: `+1555ccseller${suffix}`.slice(0, 30), name: "Contact Count Seller" },
    });
    const buyer = await prisma.user.create({
      data: { phone: `+1555ccbuyer${suffix}`.slice(0, 30), name: "Contact Count Buyer" },
    });
    sellerId = seller.id;
    sellerToken = await issueSessionToken(seller);
    buyerId = buyer.id;
    buyerToken = await issueSessionToken(buyer);

    const listing = await prisma.listing.create({
      data: {
        sellerId,
        movieName: "Contact Count Test Movie",
        theaterName: "Contact Count Test Theater",
        theaterLat: LAT,
        theaterLng: LNG,
        showtime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        bookingId: `CONTACTCOUNT${suffix}`.slice(0, 20),
        totalSeats: 3,
        availableSeats: 3,
        pricePerSeat: 300,
      },
    });
    listingId = listing.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { listingId } });
    await prisma.listingView.deleteMany({ where: { listingId } });
    await prisma.listingContact.deleteMany({ where: { listingId } });
    await prisma.listing.delete({ where: { id: listingId } });
    await prisma.user.deleteMany({ where: { id: { in: [sellerId, buyerId] } } });
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("requesting contact twice as the same buyer does not increase contactCount", async () => {
    const first = await request(contactOnlyApp)
      .post(`/api/listings/${listingId}/reserve`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ seats: 1 });
    expect(first.status).toBe(201);
    expect(first.body.data.contact).not.toBeNull();

    const second = await request(contactOnlyApp)
      .post(`/api/listings/${listingId}/reserve`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ seats: 1 });
    expect(second.status).toBe(201);

    const rows = await prisma.listingContact.findMany({ where: { listingId, userId: buyerId } });
    expect(rows).toHaveLength(1);

    const detail = await request(contactOnlyApp)
      .get(`/api/listings/${listingId}`)
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(detail.body.data.listing.contactCount).toBe(1);
  });

  it("a second, different buyer requesting contact does increase contactCount", async () => {
    const suffix = randomUUID();
    const secondBuyer = await prisma.user.create({
      data: { phone: `+1555ccbuyer2${suffix}`.slice(0, 30) },
    });
    const secondBuyerToken = await issueSessionToken(secondBuyer);

    const res = await request(contactOnlyApp)
      .post(`/api/listings/${listingId}/reserve`)
      .set("Authorization", `Bearer ${secondBuyerToken}`)
      .send({ seats: 1 });
    expect(res.status).toBe(201);

    const detail = await request(contactOnlyApp)
      .get(`/api/listings/${listingId}`)
      .set("Authorization", `Bearer ${secondBuyerToken}`);
    expect(detail.body.data.listing.contactCount).toBe(2);
    // 2 distinct viewers so far: the first buyer's own GET /:id call in
    // the previous test, plus this one - each counted once, per the
    // dedup guarantee covered in the describe block above.
    expect(detail.body.data.listing.viewCount).toBe(2);

    await prisma.transaction.deleteMany({ where: { buyerId: secondBuyer.id } });
    await prisma.listingView.deleteMany({ where: { userId: secondBuyer.id } });
    await prisma.listingContact.deleteMany({ where: { userId: secondBuyer.id } });
    await prisma.user.delete({ where: { id: secondBuyer.id } });
  });
});

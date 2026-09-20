import "dotenv/config";
import { randomUUID } from "node:crypto";
import type { Express } from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { issueSessionToken } from "../lib/session";

// Seller-only view/contact-count tracking (see the schema comment on
// Listing.viewCount/contactCount, and toMyListing in lib/serialize.ts).
// Two things to prove: the counters actually increment at the right
// points, and they never leak into a buyer-facing response.
describe("listing view/contact counts", () => {
  const LAT = 12.9716;
  const LNG = 77.5946;

  let sellerId: string;
  let sellerToken: string;
  let listingId: string;

  beforeAll(async () => {
    const suffix = randomUUID();
    const seller = await prisma.user.create({
      data: { phone: `+1555countseller${suffix}`.slice(0, 30), name: "Count Test Seller" },
    });
    sellerId = seller.id;
    sellerToken = await issueSessionToken(seller);

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
    await prisma.listing.delete({ where: { id: listingId } });
    await prisma.user.delete({ where: { id: sellerId } });
  });

  it("increments viewCount on each anonymous GET /api/listings/:id load", async () => {
    const before = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(before.viewCount).toBe(0);

    // No Authorization header at all - anonymous browsing must count too.
    await request(app).get(`/api/listings/${listingId}`);
    await request(app).get(`/api/listings/${listingId}`);
    await request(app).get(`/api/listings/${listingId}`);

    const after = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(after.viewCount).toBe(3);
  });

  it("never exposes viewCount or contactCount on the public GET /:id detail response", async () => {
    const res = await request(app).get(`/api/listings/${listingId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.listing.viewCount).toBeUndefined();
    expect(res.body.data.listing.contactCount).toBeUndefined();
  });

  it("never exposes viewCount or contactCount on GET /api/listings/search results", async () => {
    const res = await request(app).get("/api/listings/search").query({ lat: LAT, lng: LNG });
    expect(res.status).toBe(200);
    const found = res.body.data.listings.find((l: { id: string }) => l.id === listingId);
    expect(found).toBeDefined();
    expect(found.viewCount).toBeUndefined();
    expect(found.contactCount).toBeUndefined();
  });

  it("exposes both counts to the seller on GET /api/listings/mine", async () => {
    const res = await request(app)
      .get("/api/listings/mine")
      .set("Authorization", `Bearer ${sellerToken}`);
    expect(res.status).toBe(200);
    const found = res.body.data.listings.find((l: { id: string }) => l.id === listingId);
    expect(found).toBeDefined();
    // >= rather than exact, since the three GET /:id loads above already
    // happened against this same listing earlier in this file.
    expect(found.viewCount).toBeGreaterThanOrEqual(3);
    expect(found.contactCount).toBe(0);
  });
});

// contactCount only ever increments in contact_only mode (the escrow
// branch of POST /:id/reserve never sets `contact` at all) - same
// module-reload pattern as contactOnlyMode.test.ts, since PAYMENT_MODE is
// read once at module load (lib/config.ts).
describe("contactCount increments on contact_only-mode reserve", () => {
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
    await prisma.listing.delete({ where: { id: listingId } });
    await prisma.user.deleteMany({ where: { id: { in: [sellerId, buyerId] } } });
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("increments contactCount exactly when contact info is handed to a buyer, not before", async () => {
    const before = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(before.contactCount).toBe(0);

    const res = await request(contactOnlyApp)
      .post(`/api/listings/${listingId}/reserve`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ seats: 1 });
    expect(res.status).toBe(201);
    expect(res.body.data.contact).not.toBeNull();

    const after = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(after.contactCount).toBe(1);
  });

  it("increments again for a second buyer requesting contact on the same listing", async () => {
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

    const after = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(after.contactCount).toBe(2);

    await prisma.transaction.deleteMany({ where: { buyerId: secondBuyer.id } });
    await prisma.user.delete({ where: { id: secondBuyer.id } });
  });
});

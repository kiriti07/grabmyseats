import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { issueSessionToken } from "../lib/session";
import { ticketImage } from "../test/ticketImage";

// "The showtime must be in the future" on POST /api/listings and PATCH
// /api/listings/:id, judged in India time - the timezone a stored showtime
// is in (shared/src/showtime.ts). A show at "now + 1 hour" written in the
// stored form looks like the future to a naive UTC comparison, but in
// India it started 4.5 hours ago.
describe("showtime must be in the future (India time)", () => {
  const LAT = 17.4401;
  const LNG = 78.3489;
  const HOUR = 60 * 60 * 1000;
  const IST_OFFSET = 5.5 * HOUR;

  // The stored representation of "IST now + delta": IST wall clock in the
  // UTC fields.
  const istFromNow = (deltaMs: number) => new Date(Date.now() + IST_OFFSET + deltaMs).toISOString();

  let sellerId: string;
  let sellerToken: string;

  beforeAll(async () => {
    const seller = await prisma.user.create({
      data: {
        email: `showtime-valid-${randomUUID()}@example.com`,
        emailVerifiedAt: new Date(),
        phone: `+1555stv${randomUUID()}`.slice(0, 30),
        name: "Showtime Validation Seller",
      },
    });
    sellerId = seller.id;
    sellerToken = await issueSessionToken(seller);
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { sellerId } });
    await prisma.user.delete({ where: { id: sellerId } });
  });

  async function post(showtime: string) {
    return request(app)
      .post("/api/listings")
      .set("Authorization", `Bearer ${sellerToken}`)
      .field("movieName", "Showtime Validation Movie")
      .field("theaterName", "Showtime Validation Cinemas")
      .field("city", "Hyderabad")
      .field("theaterLat", String(LAT))
      .field("theaterLng", String(LNG))
      .field("bookingId", `STV${randomUUID()}`.slice(0, 20))
      .field("totalSeats", "1")
      .field("pricePerSeat", "200")
      .field("showtime", showtime)
      .attach("screenshot", await ticketImage(), { filename: "ticket.png", contentType: "image/png" });
  }

  it("POST refuses a show that already started in India, even though it's 'later' in UTC", async () => {
    const before = await prisma.listing.count({ where: { sellerId } });
    // UTC now + 1h, stored-form = 4.5h ago in India.
    const res = await post(new Date(Date.now() + HOUR).toISOString());
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("showtime must be in the future");
    expect((await post(istFromNow(-5 * 60 * 1000))).status).toBe(400);
    expect(await prisma.listing.count({ where: { sellerId } })).toBe(before);
  });

  it("POST accepts a show later today in India", async () => {
    const res = await post(istFromNow(30 * 60 * 1000));
    expect(res.status).toBe(201);
  });

  it("PATCH applies the same rule", async () => {
    const created = await post(istFromNow(24 * HOUR));
    expect(created.status).toBe(201);
    const id = created.body.data.listing.id;

    const patch = (showtime: string) =>
      request(app).patch(`/api/listings/${id}`).set("Authorization", `Bearer ${sellerToken}`).send({ showtime });

    const stale = await patch(new Date(Date.now() + HOUR).toISOString());
    expect(stale.status).toBe(400);
    expect(stale.body.error).toContain("showtime must be in the future");

    const later = istFromNow(2 * HOUR);
    const ok = await patch(later);
    expect(ok.status).toBe(200);
    expect(ok.body.data.listing.showtime).toBe(later);
  });
});

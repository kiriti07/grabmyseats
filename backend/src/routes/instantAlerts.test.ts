import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { issueSessionToken } from "../lib/session";
import { setPushSender } from "../lib/push";
import { FakePushSender } from "../test/fakePushSender";
import { ticketImage } from "../test/ticketImage";
import { alertMatchingIdle, matchAlerts, setInstantMatchRunner } from "../jobs/matchAlerts";

// Instant ticket-alert matching through the real app: a listing created (or
// edited) is matched in the background once the response has gone out,
// through the same code as the 5-minute sweep - and nothing that goes wrong
// there can touch the seller's request.
describe("instant ticket alerts", () => {
  const LAT = 12.9716;
  const LNG = 77.5946;
  const userIds: string[] = [];
  const listingIds: string[] = [];
  const alertIds: string[] = [];
  let sellerToken: string;
  let buyerId: string;
  let device: string;
  const push = new FakePushSender();

  // A made-up word per test, so no other test's listings or alerts match.
  const name = () => `Instant ${randomUUID().slice(0, 8).replace(/[0-9-]/g, "q")}`;

  beforeAll(async () => {
    const seller = await prisma.user.create({
      data: { email: `ia-seller-${randomUUID()}@example.com`, emailVerifiedAt: new Date(), phone: `+1555ias${randomUUID()}`.slice(0, 30), name: "Seller" },
    });
    const buyer = await prisma.user.create({
      data: { email: `ia-buyer-${randomUUID()}@example.com`, emailVerifiedAt: new Date(), phone: `+1555iab${randomUUID()}`.slice(0, 30), name: "Buyer" },
    });
    userIds.push(seller.id, buyer.id);
    sellerToken = await issueSessionToken(seller);
    buyerId = buyer.id;
    device = `fake-token-${randomUUID()}`;
    await prisma.pushToken.create({ data: { userId: buyer.id, token: device, platform: "android" } });
    setPushSender(push);
  });

  afterEach(async () => {
    await alertMatchingIdle();
    setInstantMatchRunner(null);
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    setPushSender(undefined);
    await prisma.alertNotification.deleteMany({ where: { alertId: { in: alertIds } } });
    await prisma.pushDelivery.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.pushToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.ticketAlert.deleteMany({ where: { id: { in: alertIds } } });
    await prisma.listingView.deleteMany({ where: { listingId: { in: listingIds } } });
    await prisma.listingContact.deleteMany({ where: { listingId: { in: listingIds } } });
    await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function alertFor(titleQuery: string, data: Record<string, unknown> = {}) {
    const a = await prisma.ticketAlert.create({
      data: {
        userId: buyerId, titleQuery, category: "MOVIE", seatsWanted: 1, dates: [],
        lat: LAT, lng: LNG, radiusKm: 7, expiresAt: new Date(Date.now() + 10 * 86_400_000),
        ...data,
      },
    });
    alertIds.push(a.id);
    return a;
  }

  async function createListing(movieName: string, totalSeats = "2") {
    const res = await request(app)
      .post("/api/listings")
      .set("Authorization", `Bearer ${sellerToken}`)
      .field("movieName", movieName)
      .field("theaterName", "Instant Test Venue")
      .field("city", "Bengaluru")
      .field("bookingId", `IA${randomUUID()}`.slice(0, 20))
      .field("totalSeats", totalSeats)
      .field("pricePerSeat", "200")
      .field("showtime", new Date(Date.now() + 2 * 86_400_000).toISOString())
      .field("theaterLat", String(LAT))
      .field("theaterLng", String(LNG))
      .attach("screenshot", await ticketImage(), { filename: "ticket.png", contentType: "image/png" });
    if (res.body?.data?.listing?.id) listingIds.push(res.body.data.listing.id);
    return res;
  }

  const notifications = (alertId: string) => prisma.alertNotification.findMany({ where: { alertId } });

  it("a new listing is matched right after the response: exactly one notification and push; the sweep adds none", async () => {
    const event = name();
    const a = await alertFor(event);
    const res = await createListing(event);
    expect(res.status).toBe(201);

    // Waits for the background run this request scheduled - no polling.
    await alertMatchingIdle();
    expect(await notifications(a.id)).toHaveLength(1);
    expect((await notifications(a.id))[0].status).toBe("SENT");
    const pushed = push.messagesTo(device).filter((m) => m.path === `/buy/${res.body.data.listing.id}`);
    expect(pushed).toHaveLength(1);

    // The 5-minute sweep runs later and finds nothing new.
    expect(await matchAlerts({ userIds: [buyerId], sender: push })).toMatchObject({ matched: 0, pushed: 0 });
    expect(await notifications(a.id)).toHaveLength(1);
    expect(push.messagesTo(device).filter((m) => m.path === `/buy/${res.body.data.listing.id}`)).toHaveLength(1);
  });

  it.each([
    ["throws", () => { throw new Error("boom"); }],
    ["rejects", () => Promise.reject(Object.assign(new Error("db down"), { code: "P1001" }))],
  ])("instant matching that %s never affects creating the listing - it's logged, by name and code only", async (_label, failing) => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    setInstantMatchRunner(failing as never);
    const event = name();
    await alertFor(event);

    const res = await createListing(event);
    expect(res.status).toBe(201);
    expect(await prisma.listing.findUnique({ where: { id: res.body.data.listing.id } })).not.toBeNull();

    await alertMatchingIdle();
    expect(errors.mock.calls.map((c) => String(c[0]))).toEqual(
      expect.arrayContaining([expect.stringMatching(/^\[jobs\] ticket alerts \(instant\) failed: Error( P1001)?$/)]),
    );
    const logged = errors.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).not.toContain(event);
  });

  it("edits: a new seat count or showtime triggers matching, a price change doesn't", async () => {
    const runs: string[] = [];
    setInstantMatchRunner(async (listingId) => {
      runs.push(listingId);
      return matchAlerts({ listingIds: [listingId], userIds: [buyerId], sender: push });
    });
    const event = name();
    const res = await createListing(event, "1");
    const id = res.body.data.listing.id;
    await alertMatchingIdle();
    expect(runs).toEqual([id]);

    const patch = (body: Record<string, unknown>) =>
      request(app).patch(`/api/listings/${id}`).set("Authorization", `Bearer ${sellerToken}`).send(body);

    expect((await patch({ pricePerSeat: 250 })).status).toBe(200);
    await alertMatchingIdle();
    expect(runs).toEqual([id]);

    // An alert wanting 3 can only match once the seats go up.
    const a = await alertFor(event, { seatsWanted: 3 });
    expect((await patch({ totalSeats: 3 })).status).toBe(200);
    await alertMatchingIdle();
    expect(runs).toEqual([id, id]);
    expect(await notifications(a.id)).toHaveLength(1);

    expect((await patch({ showtime: new Date(Date.now() + 3 * 86_400_000).toISOString() })).status).toBe(200);
    await alertMatchingIdle();
    expect(runs).toEqual([id, id, id]);
    expect(await notifications(a.id)).toHaveLength(1);
  });
});

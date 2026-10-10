import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { issueSessionToken } from "../lib/session";
import { storageProvider } from "../lib/storage";
import { NO_TICKET_CODE_MESSAGE } from "../lib/ticketBarcode";
import { ticketFingerprint } from "../lib/ticketFingerprint";
import { ticketImage, uniqueTicketPayload } from "../test/ticketImage";

// The barcode requirement and duplicate-ticket rule on POST /api/listings
// and POST /api/listings/ocr. Payloads are unique per test (uniqueTicketPayload)
// - the five real fixtures are only ever scanned, never listed, so no other
// test file can find one of them already live. A seller pin inside the city
// keeps listing creation off Nominatim; fetch is stubbed to fail regardless.
describe("ticket barcode requirement", () => {
  const FIXTURES_DIR = path.join(__dirname, "../lib/__fixtures__/tickets");
  const fixture = (file: string) => fs.readFileSync(path.join(FIXTURES_DIR, file));
  const GACHIBOWLI = { lat: 17.4401, lng: 78.3489 };
  const DUPLICATE_MESSAGE =
    "This ticket is already listed on GrabMySeats. If you listed it, you'll find it in My Listings; otherwise contact support@grabmyseats.com.";

  const userIds: string[] = [];
  let sellerA: { id: string; email: string; token: string };
  let sellerB: { id: string; email: string; token: string };

  async function createSeller(label: string) {
    const email = `barcode-${label}-${randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: { email, emailVerifiedAt: new Date(), phone: `+1555bc${randomUUID()}`.slice(0, 30), name: `Seller ${label}` },
    });
    userIds.push(user.id);
    return { id: user.id, email, token: await issueSessionToken(user) };
  }

  function listTicket(token: string, image: Buffer, extra: Record<string, string> = {}) {
    let req = request(app)
      .post("/api/listings")
      .set("Authorization", `Bearer ${token}`)
      .field("movieName", "Barcode Test Movie")
      .field("theaterName", "Barcode Test Cinemas")
      .field("city", "Hyderabad")
      .field("theaterLat", String(GACHIBOWLI.lat))
      .field("theaterLng", String(GACHIBOWLI.lng))
      .field("bookingId", `BC${randomUUID()}`.slice(0, 20))
      .field("totalSeats", "2")
      .field("pricePerSeat", "200")
      .field("showtime", new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
    for (const [k, v] of Object.entries(extra)) req = req.field(k, v);
    return req.attach("screenshot", image, { filename: "ticket.png", contentType: "image/png" });
  }

  function scan(token: string, image: Buffer, category = "EVENT") {
    return request(app)
      .post("/api/listings/ocr")
      .set("Authorization", `Bearer ${token}`)
      .field("category", category)
      .attach("screenshot", image, { filename: "ticket.jpg", contentType: "image/jpeg" });
  }

  async function listingCount(sellerId: string) {
    return prisma.listing.count({ where: { sellerId } });
  }

  beforeAll(async () => {
    sellerA = await createSeller("a");
    sellerB = await createSeller("b");
  });

  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network in this test"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { sellerId: { in: userIds } } });
    // Pin votes cascade with the users; the venue they voted on is this file's own.
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.venue.deleteMany({ where: { normalizedName: { contains: "barcode test cinemas" } } });
  });

  describe("images with no readable code are refused (422)", () => {
    const REJECTED = ["plain-photo.jpeg", "no-code-screenshot.jpeg"];

    it.each(REJECTED)("POST /ocr refuses %s", async (file) => {
      const res = await scan(sellerA.token, fixture(file));
      expect(res.status).toBe(422);
      expect(res.body).toEqual({ success: false, error: NO_TICKET_CODE_MESSAGE });
    });

    it.each(REJECTED)(
      "the skip-auto-fill path (POST /api/listings without /ocr) still refuses %s",
      async (file) => {
        const before = await listingCount(sellerA.id);
        const res = await listTicket(sellerA.token, fixture(file));
        expect(res.status).toBe(422);
        expect(res.body).toEqual({ success: false, error: NO_TICKET_CODE_MESSAGE });
        expect(await listingCount(sellerA.id)).toBe(before);
      },
    );

    it("a client-supplied qrData can't stand in for a code in the image", async () => {
      const res = await listTicket(sellerA.token, fixture("no-code-screenshot.jpeg"), {
        qrData: "T2A2HDN,21285,15-May-2026,22:20",
      });
      expect(res.status).toBe(422);
    });
  });

  it.each([
    "drishyam3-app-share.jpeg",
    "hokum-static-card.jpeg",
    "irumudi-app-share.jpeg",
    "irumudi-static-card.jpg",
    "ustaad-bhagat-singh-app-share.jpeg",
  ])("POST /ocr accepts the real booking screenshot %s, without echoing its code", async (file) => {
    const res = await scan(sellerA.token, fixture(file));
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data)).toEqual(["fields"]);
  });

  it("stores only the fingerprint: no upload, no screenshotUrl, no qrData", async () => {
    const upload = vi.spyOn(storageProvider, "upload");
    const payload = uniqueTicketPayload();
    const res = await listTicket(sellerA.token, await ticketImage(payload), { qrData: payload });
    expect(res.status).toBe(201);
    expect(upload).not.toHaveBeenCalled();
    const row = await prisma.listing.findUniqueOrThrow({ where: { id: res.body.data.listing.id } });
    expect(row.ticketFingerprint).toBe(ticketFingerprint(payload));
    expect(row.screenshotUrl).toBeNull();
    expect(row.qrData).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain(payload);
  });

  describe("a ticket can only be live in one listing (409)", () => {
    it("refuses the same ticket again - from another seller or the same one - without naming the other seller", async () => {
      const payload = uniqueTicketPayload();
      expect((await listTicket(sellerA.token, await ticketImage(payload))).status).toBe(201);

      for (const token of [sellerB.token, sellerA.token]) {
        const before = await listingCount(sellerB.id);
        const res = await listTicket(token, await ticketImage(payload));
        expect(res.status).toBe(409);
        expect(res.body).toEqual({ success: false, error: DUPLICATE_MESSAGE });
        expect(await listingCount(sellerB.id)).toBe(before);
      }
      const scanned = await scan(sellerB.token, await ticketImage(payload));
      expect(scanned.status).toBe(409);
      expect(scanned.body).toEqual({ success: false, error: DUPLICATE_MESSAGE });
      for (const leak of [sellerA.id, sellerA.email, "Seller a"]) {
        expect(JSON.stringify(scanned.body)).not.toContain(leak);
      }
    });

    it("refuses an image where any code - not just the largest - is already live", async () => {
      const live = uniqueTicketPayload();
      expect((await listTicket(sellerA.token, await ticketImage(live))).status).toBe(201);
      // A new, larger code added next to the live ticket's.
      const disguised = await ticketImage(uniqueTicketPayload(), { extra: { text: live } });
      expect((await listTicket(sellerB.token, disguised)).status).toBe(409);
    });

    it("two simultaneous listings of one ticket: exactly one wins", async () => {
      const payload = uniqueTicketPayload();
      const image = await ticketImage(payload);
      const results = await Promise.all([listTicket(sellerA.token, image), listTicket(sellerB.token, image)]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await prisma.listing.count({ where: { ticketFingerprint: ticketFingerprint(payload) } })).toBe(1);
    });

    it("the database index is the backstop when the pre-check is bypassed", async () => {
      const payload = uniqueTicketPayload();
      expect((await listTicket(sellerA.token, await ticketImage(payload))).status).toBe(201);
      // Pretend the pre-check found nothing (as when racing another request).
      const preCheck = vi.spyOn(prisma, "$queryRaw").mockResolvedValueOnce([] as never);
      const res = await listTicket(sellerB.token, await ticketImage(payload));
      expect(preCheck).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ success: false, error: DUPLICATE_MESSAGE });
    });

    // Which earlier listing statuses still hold the ticket.
    it.each([
      ["SOLD", { status: "SOLD" as const, availableSeats: 0 }, 409],
      ["FLAGGED", { status: "FLAGGED" as const }, 409],
      ["PARTIALLY_SOLD", { status: "PARTIALLY_SOLD" as const, availableSeats: 1 }, 409],
      ["WITHDRAWN after a sale", { status: "WITHDRAWN" as const, availableSeats: 1 }, 409],
      ["WITHDRAWN with no sales", { status: "WITHDRAWN" as const }, 201],
      ["EXPIRED", { status: "EXPIRED" as const }, 201],
    ])("an earlier listing that is %s -> %s", async (_label, update, expected) => {
      const payload = uniqueTicketPayload();
      const first = await listTicket(sellerA.token, await ticketImage(payload));
      await prisma.listing.update({ where: { id: first.body.data.listing.id }, data: update });
      const second = await listTicket(sellerB.token, await ticketImage(payload));
      expect(second.status).toBe(expected);
    });

    it("the index ignores rows without a fingerprint and listings that no longer hold one", async () => {
      const fp = ticketFingerprint(uniqueTicketPayload());
      const base = {
        sellerId: sellerA.id,
        movieName: "Index Test",
        theaterName: "Index Test Cinemas",
        theaterLat: GACHIBOWLI.lat,
        theaterLng: GACHIBOWLI.lng,
        showtime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        totalSeats: 2,
        availableSeats: 2,
        pricePerSeat: 100,
      };
      const bookingId = () => `IDX${randomUUID()}`.slice(0, 20);
      // Legacy rows: no fingerprint, any number of them.
      await prisma.listing.create({ data: { ...base, bookingId: bookingId() } });
      await prisma.listing.create({ data: { ...base, bookingId: bookingId() } });
      // Two non-holding rows plus one live row with the same fingerprint.
      await prisma.listing.create({ data: { ...base, bookingId: bookingId(), ticketFingerprint: fp, status: "EXPIRED" } });
      await prisma.listing.create({ data: { ...base, bookingId: bookingId(), ticketFingerprint: fp, status: "WITHDRAWN" } });
      await prisma.listing.create({ data: { ...base, bookingId: bookingId(), ticketFingerprint: fp } });
      // A second live one is refused by Postgres itself.
      await expect(
        prisma.listing.create({ data: { ...base, bookingId: bookingId(), ticketFingerprint: fp } }),
      ).rejects.toMatchObject({ code: "P2002" });
    });
  });

  it("without TICKET_FINGERPRINT_SECRET, listing is refused (503) rather than unprotected", async () => {
    vi.stubEnv("TICKET_FINGERPRINT_SECRET", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const before = await listingCount(sellerA.id);
    const res = await listTicket(sellerA.token, await ticketImage());
    expect(res.status).toBe(503);
    expect(await listingCount(sellerA.id)).toBe(before);
  });
});

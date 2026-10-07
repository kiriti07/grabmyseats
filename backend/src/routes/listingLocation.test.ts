import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import request from "supertest";
import { INDIAN_METRO_CITIES } from "@grabmyseats/shared";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { issueSessionToken } from "../lib/session";
import { storageProvider } from "../lib/storage";

// Location precision end to end through POST /api/listings
// (resolveListingLocation in lib/geo/venueLookup.ts): EXACT / AREA / CITY,
// never failing a listing over location, and every resolved point inside the
// selected city. Nominatim (fetch) and the screenshot upload are mocked. Names
// carry a per-run tag word so neither the Venue table nor the Nominatim cache
// (both persist locally) can answer for a different run.
describe("listing location precision", () => {
  const TAG = `t${randomUUID().slice(0, 8)}`;
  const HYDERABAD = INDIAN_METRO_CITIES.find((c) => c.id === "hyderabad")!;
  const KOKAPET = { lat: 17.3916, lng: 78.3226 };
  const GACHIBOWLI = { lat: 17.4401, lng: 78.3489 };
  const MUMBAI = { lat: 19.076, lng: 72.8777 };
  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );

  const userIds: string[] = [];
  const listingIds: string[] = [];
  let token: string;
  let fetchSpy: MockInstance<typeof fetch>;
  let osm: (q: string) => unknown[];

  function cinema(name: string, at: { lat: number; lng: number }) {
    return { lat: String(at.lat), lon: String(at.lng), display_name: name, category: "amenity", type: "cinema" };
  }

  async function createListing(fields: {
    theaterName: string;
    city?: string;
    pin?: { lat: number; lng: number };
  }) {
    const req = request(app)
      .post("/api/listings")
      .set("Authorization", `Bearer ${token}`)
      .field("movieName", "Precision Test Movie")
      .field("theaterName", fields.theaterName)
      .field("bookingId", `PREC${randomUUID()}`.slice(0, 20))
      .field("totalSeats", "1")
      .field("pricePerSeat", "200")
      .field("showtime", new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
      .attach("screenshot", onePixelPng, { filename: "test.png", contentType: "image/png" });
    if (fields.city !== undefined) req.field("city", fields.city);
    if (fields.pin) req.field("theaterLat", String(fields.pin.lat)).field("theaterLng", String(fields.pin.lng));
    const res = await req;
    if (res.body?.data?.listing?.id) listingIds.push(res.body.data.listing.id);
    return res;
  }

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `precision-${randomUUID()}@example.com`,
        emailVerifiedAt: new Date(),
        phone: `+1555prec${randomUUID()}`.slice(0, 30),
      },
    });
    userIds.push(user.id);
    token = await issueSessionToken(user);
  });

  beforeEach(() => {
    vi.stubEnv("NOMINATIM_MIN_INTERVAL_MS", "0");
    vi.spyOn(storageProvider, "upload").mockResolvedValue({ url: "https://example.com/test.png" } as never);
    osm = () => [];
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const q = new URL(String(input)).searchParams.get("q") ?? "";
      return new Response(JSON.stringify(osm(q)), { status: 200 });
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
    await prisma.venue.deleteMany({ where: { normalizedName: { contains: TAG } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  describe("EXACT", () => {
    it("a seller-confirmed pin inside the city", async () => {
      const res = await createListing({ theaterName: `Pinned Cinemas ${TAG}`, city: "Hyderabad", pin: GACHIBOWLI });
      expect(res.status).toBe(201);
      expect(res.body.data.listing).toMatchObject({
        locationPrecision: "EXACT",
        cityName: "Hyderabad",
        theaterLat: GACHIBOWLI.lat,
        theaterLng: GACHIBOWLI.lng,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("a Venue table match", async () => {
      await prisma.venue.create({
        data: {
          normalizedName: `known cinemas ${TAG}`,
          locality: "kokapet",
          displayName: "Known Cinemas, Kokapet",
          cityId: "hyderabad",
          ...KOKAPET,
          source: "SEEDED",
        },
      });
      const res = await createListing({ theaterName: `Known Cinemas ${TAG}: Kokapet`, city: "Hyderabad" });
      expect(res.body.data.listing).toMatchObject({ locationPrecision: "EXACT", theaterLat: KOKAPET.lat });
    });

    it("exactly one matching OSM cinema in the city that mentions the locality", async () => {
      osm = (q) =>
        q.startsWith(`osm cinemas ${TAG}`)
          ? [cinema(`OSM Cinemas ${TAG}, Kokapet main road, Kokapet`, { lat: 17.3883, lng: 78.3447 })]
          : [];
      const res = await createListing({ theaterName: `OSM Cinemas ${TAG} Kokapet Hyderabad`, city: "Hyderabad" });
      expect(res.body.data.listing).toMatchObject({ locationPrecision: "EXACT", theaterLat: 17.3883 });
    });
  });

  describe("AREA", () => {
    it("only the locality resolved", async () => {
      osm = (q) =>
        q === `area${TAG}`
          ? [{ lat: "17.3949", lon: "78.3365", display_name: `Area${TAG}, Ranga Reddy`, category: "place", type: "suburb" }]
          : [];
      const res = await createListing({ theaterName: `Unknown${TAG} Cinemas Area${TAG}`, city: "Hyderabad" });
      expect(res.status).toBe(201);
      expect(res.body.data.listing).toMatchObject({
        locationPrecision: "AREA",
        cityName: "Hyderabad",
        theaterLat: 17.3949,
        theaterLng: 78.3365,
      });
    });

    it("a chain name resolves to its mall (PVR Superplex Inorbit -> Inorbit)", async () => {
      osm = (q) =>
        q === `inorbit${TAG}`
          ? [{ lat: "17.4346", lon: "78.3867", display_name: `Inorbit${TAG} Mall, Madhapur`, category: "shop", type: "mall" }]
          : [];
      const res = await createListing({ theaterName: `PVR Superplex Inorbit${TAG} Hyderabad`, city: "Hyderabad" });
      expect(res.body.data.listing).toMatchObject({ locationPrecision: "AREA", theaterLat: 17.4346 });
    });
  });

  describe("CITY - never fails, never keeps a wrong pin", () => {
    function expectCityCenter(listing: Record<string, unknown>) {
      expect(listing).toMatchObject({
        locationPrecision: "CITY",
        cityName: "Hyderabad",
        theaterLat: HYDERABAD.lat,
        theaterLng: HYDERABAD.lng,
      });
    }

    it("nothing resolves", async () => {
      const res = await createListing({ theaterName: `Nowhere Talkies ${TAG}`, city: "Hyderabad" });
      expect(res.status).toBe(201);
      expectCityCenter(res.body.data.listing);
    });

    it("OpenStreetMap is down or rate-limiting", async () => {
      fetchSpy.mockRejectedValue(new Error("network down"));
      const down = await createListing({ theaterName: `Offline Cinemas ${TAG}: Kokapet${TAG}`, city: "Hyderabad" });
      expect(down.status).toBe(201);
      expectCityCenter(down.body.data.listing);

      fetchSpy.mockImplementation(async () => new Response("{}", { status: 429 }));
      const limited = await createListing({ theaterName: `Limited Cinemas ${TAG}`, city: "Hyderabad" });
      expect(limited.status).toBe(201);
      expectCityCenter(limited.body.data.listing);
    });

    it("a matching cinema outside the city's box is not kept", async () => {
      osm = () => [cinema(`Faraway Cinemas ${TAG}, Mumbai`, MUMBAI)];
      const res = await createListing({ theaterName: `Faraway Cinemas ${TAG}`, city: "Hyderabad" });
      expectCityCenter(res.body.data.listing);
    });

    it("a weak match - two same-brand cinemas, or a road for the locality - is not kept", async () => {
      osm = (q) =>
        q === `twinplex ${TAG}`
          ? [
              cinema(`Twinplex ${TAG} One, Madhapur`, { lat: 17.4308, lng: 78.3735 }),
              cinema(`Twinplex ${TAG} Two, Madhapur`, { lat: 17.4352, lng: 78.3868 }),
            ]
          : q === `roadside${TAG}`
            ? [{ lat: "17.43", lon: "78.38", display_name: `Roadside${TAG} Road`, category: "highway", type: "secondary" }]
            : [];
      const ambiguous = await createListing({ theaterName: `Twinplex ${TAG}`, city: "Hyderabad" });
      expectCityCenter(ambiguous.body.data.listing);

      const road = await createListing({ theaterName: `Nowhere Cinemas ${TAG}: Roadside${TAG}`, city: "Hyderabad" });
      expectCityCenter(road.body.data.listing);
    });

    it("a seller pin outside the city is ignored", async () => {
      const res = await createListing({ theaterName: `Strayed Talkies ${TAG}`, city: "Hyderabad", pin: MUMBAI });
      expect(res.status).toBe(201);
      expectCityCenter(res.body.data.listing);
    });

    it("an insert that forgets to set a precision gets CITY (the column's fail-safe default)", async () => {
      const listing = await prisma.listing.create({
        data: {
          sellerId: userIds[0],
          movieName: "Default Precision Movie",
          theaterName: "Default Precision Theater",
          theaterLat: HYDERABAD.lat,
          theaterLng: HYDERABAD.lng,
          showtime: new Date(Date.now() + 24 * 60 * 60 * 1000),
          bookingId: `DEFPREC${randomUUID()}`.slice(0, 20),
          totalSeats: 1,
          availableSeats: 1,
          pricePerSeat: 100,
        },
      });
      listingIds.push(listing.id);
      expect(listing.locationPrecision).toBe("CITY");
    });
  });

  it("city is required - the only location-related reason a listing is refused", async () => {
    const missing = await createListing({ theaterName: `No City Cinemas ${TAG}` });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toContain("city is required");
    const unknown = await createListing({ theaterName: `No City Cinemas ${TAG}`, city: "Atlantis" });
    expect(unknown.status).toBe(400);
  });

  it("search and detail carry precision and city for the buyer's distance display", async () => {
    const exact = await createListing({ theaterName: `Shown Cinemas ${TAG}`, city: "Hyderabad", pin: GACHIBOWLI });
    const city = await createListing({ theaterName: `Shown Talkies ${TAG}`, city: "Hyderabad" });
    const exactId = exact.body.data.listing.id as string;
    const cityId = city.body.data.listing.id as string;

    const search = await request(app)
      .get("/api/listings/search")
      .query({ lat: HYDERABAD.lat, lng: HYDERABAD.lng, radiusKm: 50 });
    const found = (search.body.data.listings as { id: string }[]).filter((l) => [exactId, cityId].includes(l.id));
    expect(found).toHaveLength(2);
    expect(found.find((l) => l.id === exactId)).toMatchObject({ locationPrecision: "EXACT", cityName: "Hyderabad" });
    expect(found.find((l) => l.id === cityId)).toMatchObject({ locationPrecision: "CITY", cityName: "Hyderabad" });

    const detail = await request(app)
      .get(`/api/listings/${cityId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(detail.body.data.listing).toMatchObject({ locationPrecision: "CITY", cityName: "Hyderabad" });
  });
});

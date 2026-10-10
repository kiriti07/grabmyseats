import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { issueSessionToken } from "../lib/session";
import { ticketImage } from "../test/ticketImage";
import { learnVenuePin } from "../lib/geo/venueLearning";

// Venue lookup (POST /api/listings/geocode -> lib/geo/venueLookup.ts) and
// learning from confirmed pins (POST /api/listings -> lib/geo/
// venueLearning.ts), against the real local Postgres + Redis. Nominatim
// (fetch) is mocked; screenshots are generated QR tickets. Venue names end in a per-run
// tag word, since venues and the Nominatim cache persist in the local
// DB/Redis - as the *last* word, so brands (first words) stay real words.
describe("venue lookup and learning", () => {
  const TAG = `t${randomUUID().slice(0, 8)}`;
  const userIds: string[] = [];
  const listingIds: string[] = [];
  let sellerToken: string;

  // Points inside Hyderabad's bounds.
  const KOKAPET = { lat: 17.3916, lng: 78.3226 };
  const GACHIBOWLI = { lat: 17.4401, lng: 78.3489 };
  const MUMBAI = { lat: 19.076, lng: 72.8777 };

  let fetchSpy: MockInstance<typeof fetch>;
  // Nominatim stand-in: answers by query text; records what was asked.
  let osm: (q: string) => unknown[];
  const asked: string[] = [];

  async function createUser() {
    const user = await prisma.user.create({
      data: {
        email: `venue-${randomUUID()}@example.com`,
        emailVerifiedAt: new Date(),
        phone: `+1555venue${randomUUID()}`.slice(0, 30),
      },
    });
    userIds.push(user.id);
    return { user, token: await issueSessionToken(user) };
  }

  function lookup(theaterName: string, city = "Hyderabad", token = sellerToken) {
    return request(app)
      .post("/api/listings/geocode")
      .set("Authorization", `Bearer ${token}`)
      .send({ theaterName, city });
  }

  async function seedVenue(name: string, locality: string, at: { lat: number; lng: number }) {
    return prisma.venue.create({
      data: {
        normalizedName: name,
        locality,
        displayName: `${name} ${locality}`.trim(),
        cityId: "hyderabad",
        ...at,
        source: "SEEDED",
      },
    });
  }

  beforeAll(async () => {
    ({ token: sellerToken } = await createUser());
  });

  beforeEach(() => {
    vi.stubEnv("NOMINATIM_MIN_INTERVAL_MS", "0");
    asked.length = 0;
    osm = () => [];
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const q = new URL(String(input)).searchParams.get("q") ?? "";
      asked.push(q);
      return new Response(JSON.stringify(osm(q)), { status: 200 });
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.venue.deleteMany({ where: { normalizedName: { contains: TAG } } });
    await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  describe("lookup", () => {
    it("matches the Venue table fuzzily (by name + locality) without calling OpenStreetMap", async () => {
      await seedVenue(`zylo cinemas ${TAG}`, "kokapet", KOKAPET);
      const res = await lookup(`ZYLO Cinemas ${TAG}: Kokapet(SCREEN 2)`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        found: true,
        kind: "venue",
        source: "venue",
        approximate: false,
        ...KOKAPET,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("tolerates small spelling differences (pg_trgm)", async () => {
      await seedVenue(`quarx multiplex ${TAG}`, "", GACHIBOWLI);
      const res = await lookup(`Quarx Multiplx ${TAG}`);
      expect(res.body.data.source).toBe("venue");
    });

    it("never matches a same-named venue in a different locality", async () => {
      await seedVenue(`vexa ${TAG}`, "kukatpally", KOKAPET);
      const res = await lookup(`VEXA ${TAG}: Gachibowli`);
      expect(res.body.data.source).not.toBe("venue");
      expect(fetchSpy).toHaveBeenCalled();
    });

    it("treats a bare name matching several branches as ambiguous, not a match", async () => {
      await seedVenue(`omni ${TAG}`, "kokapet", KOKAPET);
      await seedVenue(`omni ${TAG}`, "gachibowli", GACHIBOWLI);
      const res = await lookup(`OMNI ${TAG}`);
      expect(res.body.data.source).not.toBe("venue");
    });

    it("never matches a different brand that shares generic words and the locality", async () => {
      // "ALLU Cinemas" vs "Asian Cinemas" at Kokapet: ~0.5 name similarity,
      // identical locality - the brand (first word) check rejects it.
      // Its own tag: the OSM misses this lookup caches must not answer the
      // candidate-order test below.
      await seedVenue(`asian cinemas ${TAG}b`, "kokapet", KOKAPET);
      const res = await lookup(`ALLU Cinemas ${TAG}b: Kokapet`);
      expect(res.body.data.source).not.toBe("venue");
    });

    it("tries the candidates in order (no city text - the box bounds it) and stops at the first cinema", async () => {
      osm = (q) =>
        q === `allu cinemas ${TAG}`
          ? [
              {
                lat: "17.3883",
                lon: "78.3447",
                display_name: `ALLU Cinemas ${TAG}, Kokapet main road, Kokapet, Ranga Reddy`,
                category: "amenity",
                type: "cinema",
              },
            ]
          : [];
      const res = await lookup(`ALLU Cinemas ${TAG}: Kokapet`);
      expect(asked).toEqual([`allu cinemas ${TAG}, kokapet`, `allu cinemas ${TAG}`]);
      expect(res.body.data).toMatchObject({ kind: "venue", source: "osm", approximate: false });
    });

    it("a cinema hit that doesn't mention the known locality is a different branch - skipped", async () => {
      osm = (q) =>
        q.startsWith(`brandx cinemas ${TAG}`)
          ? [
              {
                lat: "17.44",
                lon: "78.35",
                display_name: `BrandX Cinemas ${TAG}, Kukatpally, Hyderabad`,
                category: "amenity",
                type: "cinema",
              },
            ]
          : [];
      const res = await lookup(`BrandX Cinemas ${TAG}: Kokapet`);
      expect(res.body.data.kind).not.toBe("venue");
    });

    it("two same-brand cinemas the locality can't tell apart are ambiguous - no EXACT", async () => {
      osm = (q) =>
        q === `twinplex ${TAG}`
          ? [
              { lat: "17.4308", lon: "78.3735", display_name: `Twinplex ${TAG} One, Madhapur`, category: "amenity", type: "cinema" },
              { lat: "17.4352", lon: "78.3868", display_name: `Twinplex ${TAG} Two, Madhapur`, category: "amenity", type: "cinema" },
            ]
          : [];
      const res = await lookup(`Twinplex ${TAG}`);
      expect(res.body.data.kind).toBe("none");
    });

    it("a road is never accepted as a locality", async () => {
      osm = (q) =>
        q === `mallroad ${TAG}`
          ? [{ lat: "17.4366", lon: "78.3809", display_name: `Mallroad ${TAG} Road`, category: "highway", type: "secondary" }]
          : [];
      const res = await lookup(`Nowhere Cinemas ${TAG}: Mallroad ${TAG}`);
      expect(res.body.data.kind).toBe("none");
    });

    it("a Venue row with coordinates outside the city is ignored", async () => {
      await seedVenue(`badseed cinemas ${TAG}`, "", MUMBAI);
      const res = await lookup(`Badseed Cinemas ${TAG}`);
      expect(res.body.data.source).not.toBe("venue");
    });

    it("falls back to the locality: pin there, marked approximate", async () => {
      osm = (q) =>
        q === `kokapet ${TAG}`
          ? [{ lat: "17.39", lon: "78.32", display_name: "Kokapet, Hyderabad", category: "place", type: "suburb" }]
          : [];
      const res = await lookup(`Nowhere Cinemas ${TAG}: Kokapet ${TAG}`);
      expect(res.body.data).toMatchObject({
        found: true,
        kind: "locality",
        approximate: true,
        lat: 17.39,
        lng: 78.32,
        locality: `Kokapet ${TAG}`,
      });
    });

    it("rejects a non-cinema hit that doesn't carry the venue's name", async () => {
      osm = () => [
        { lat: "17.44", lon: "78.34", display_name: "Some Bus Stop, Hyderabad", category: "highway", type: "bus_stop" },
      ];
      const res = await lookup(`Pluto Talkies ${TAG}`);
      expect(res.body.data.kind).toBe("none");
    });

    it("ignores results outside the selected city", async () => {
      // A perfectly matching cinema - but in Mumbai.
      osm = () => [
        {
          lat: String(MUMBAI.lat),
          lon: String(MUMBAI.lng),
          display_name: `Faraway Cinema ${TAG}, Mumbai`,
          category: "amenity",
          type: "cinema",
        },
      ];
      const res = await lookup(`Faraway Cinema ${TAG}`);
      expect(res.body.data.kind).toBe("none");
    });

    it("rate-limits lookups per user (20 per 10 minutes)", async () => {
      const { token } = await createUser();
      await seedVenue(`ratelimit ${TAG}`, "", KOKAPET);
      const statuses: number[] = [];
      for (let i = 0; i < 21; i++) statuses.push((await lookup(`ratelimit ${TAG}`, "Hyderabad", token)).status);
      expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
      expect(statuses[20]).toBe(429);
    });
  });

  describe("learning (lib/geo/venueLearning.ts)", () => {
    const pin = (base: { lat: number; lng: number }, northMeters = 0) => ({
      lat: base.lat + northMeters / 111_320,
      lng: base.lng,
    });

    async function learn(userId: string, name: string, at: { lat: number; lng: number }, approximate = false) {
      return learnVenuePin({ userId, theaterName: name, cityName: "Hyderabad", ...at, approximate });
    }

    async function venue(name: string, locality = "") {
      return prisma.venue.findUnique({
        where: {
          cityId_normalizedName_locality: { cityId: "hyderabad", normalizedName: name, locality },
        },
      });
    }

    it("creates a venue from a confirmed pin, keyed on name + locality", async () => {
      const { user } = await createUser();
      expect(await learn(user.id, `Learn Cinemas ${TAG}: Kokapet`, KOKAPET)).toBe("created");
      const v = await venue(`learn cinemas ${TAG}`, "kokapet");
      expect(v).toMatchObject({
        ...KOKAPET,
        source: "SELLER_CONFIRMED",
        displayName: `Learn Cinemas ${TAG}, Kokapet`,
      });
    });

    it("refuses a pin outside the city's bounding area", async () => {
      const { user } = await createUser();
      expect(await learn(user.id, `Outside Cinemas ${TAG}`, MUMBAI)).toBe("rejected_out_of_bounds");
      expect(await venue(`outside cinemas ${TAG}`)).toBeNull();
    });

    it("never learns an undragged approximate (locality) pin", async () => {
      const { user } = await createUser();
      expect(await learn(user.id, `Approx Cinemas ${TAG}: Kokapet`, KOKAPET, true)).toBe(
        "skipped_approximate",
      );
      expect(await venue(`approx cinemas ${TAG}`, "kokapet")).toBeNull();
    });

    it("one seller - even repeatedly - can't move an existing venue", async () => {
      const name = `Solo ${TAG} Cinemas`;
      const [{ user: first }, { user: other }] = [await createUser(), await createUser()];
      await learn(first.id, name, KOKAPET);
      for (let i = 0; i < 3; i++) {
        expect(await learn(other.id, name, pin(KOKAPET, 1000 + i * 10))).toBe("vote_recorded");
      }
      expect(await venue(`solo ${TAG} cinemas`)).toMatchObject(KOKAPET);
    });

    it("a nearby pin just confirms the venue", async () => {
      const name = `Near ${TAG} Cinemas`;
      const [{ user: first }, { user: other }] = [await createUser(), await createUser()];
      await learn(first.id, name, KOKAPET);
      expect(await learn(other.id, name, pin(KOKAPET, 100))).toBe("confirmed");
    });

    it("three different sellers agreeing within 150m move it, to their centroid", async () => {
      const name = `Moved ${TAG} Cinemas`;
      const { user: creator } = await createUser();
      await learn(creator.id, name, KOKAPET);
      const sellers = [await createUser(), await createUser(), await createUser()];

      expect(await learn(sellers[0].user.id, name, pin(KOKAPET, 1000))).toBe("vote_recorded");
      expect(await learn(sellers[1].user.id, name, pin(KOKAPET, 1060))).toBe("vote_recorded");
      expect(await learn(sellers[2].user.id, name, pin(KOKAPET, 1120))).toBe("moved");

      const moved = await venue(`moved ${TAG} cinemas`);
      expect(moved!.lat).toBeCloseTo(pin(KOKAPET, 1060).lat, 6);
      expect(moved!.lng).toBeCloseTo(KOKAPET.lng, 6);
    });

    it("three sellers who don't agree with each other (spread over 600m) don't move it", async () => {
      const name = `Spread ${TAG} Cinemas`;
      const { user: creator } = await createUser();
      await learn(creator.id, name, KOKAPET);
      for (const meters of [1000, 1300, 1600]) {
        const { user } = await createUser();
        expect(await learn(user.id, name, pin(KOKAPET, meters))).toBe("vote_recorded");
      }
      expect(await venue(`spread ${TAG} cinemas`)).toMatchObject(KOKAPET);
    });
  });

  describe("POST /api/listings feeds learning", () => {

    async function createListing(theaterName: string, pin: { lat: number; lng: number } | null) {
      const req = request(app)
        .post("/api/listings")
        .set("Authorization", `Bearer ${sellerToken}`)
        .field("movieName", "Venue Learning Movie")
        .field("theaterName", theaterName)
        .field("city", "Hyderabad")
        .field("bookingId", `VENUE${randomUUID()}`.slice(0, 20))
        .field("totalSeats", "1")
        .field("pricePerSeat", "200")
        .field("showtime", new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
        .attach("screenshot", await ticketImage(), { filename: "ticket.png", contentType: "image/png" });
      if (pin) req.field("theaterLat", String(pin.lat)).field("theaterLng", String(pin.lng));
      const res = await req;
      expect(res.status).toBe(201);
      listingIds.push(res.body.data.listing.id);
    }

    it("a confirmed pin creates the venue", async () => {
      await createListing(`PVR ${TAG}: Atrium Gachibowli, Hyderabad(AUDI 04)`, GACHIBOWLI);
      const v = await prisma.venue.findUnique({
        where: {
          cityId_normalizedName_locality: {
            cityId: "hyderabad",
            normalizedName: `pvr ${TAG}`,
            locality: "atrium gachibowli",
          },
        },
      });
      expect(v).toMatchObject(GACHIBOWLI);
    });

    it("a server-resolved location (no seller pin) is never learned", async () => {
      await createListing(`Unpinned ${TAG}: Kokapet`, null);
      expect(await prisma.venue.count({ where: { normalizedName: `unpinned ${TAG}` } })).toBe(0);
    });

    it("a seller pin outside the selected city is ignored - not learned, not used", async () => {
      await createListing(`Strayed ${TAG}: Kokapet`, MUMBAI);
      expect(await prisma.venue.count({ where: { normalizedName: `strayed ${TAG}` } })).toBe(0);
    });
  });
});

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { CITY_BOUNDS } from "@grabmyseats/shared";
import { nominatimSearch } from "./geocode";

// The Nominatim client's usage-policy behaviour (lib/geocode.ts): User-Agent,
// city-bounded queries, Redis-backed 1 req/sec throttle and caching. fetch is
// mocked - nothing here reaches the real Nominatim. Every test uses a fresh
// query string, since the cache lives in the (local) Redis across runs.
describe("nominatimSearch", () => {
  let fetchSpy: MockInstance<typeof fetch>;

  function respondWith(body: unknown, status = 200) {
    fetchSpy.mockImplementation(async () => new Response(JSON.stringify(body), { status }));
  }

  const cinema = {
    lat: "17.3916",
    lon: "78.3226",
    display_name: "ALLU Cinemas, Kokapet, Hyderabad",
    category: "amenity",
    type: "cinema",
  };

  beforeEach(() => {
    // Throttling is exercised explicitly below; elsewhere it'd only slow
    // the suite down.
    vi.stubEnv("NOMINATIM_MIN_INTERVAL_MS", "0");
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("identifies itself and bounds the search to India and the city", async () => {
    respondWith([cinema]);
    const places = await nominatimSearch(`ALLU Cinemas ${randomUUID()}`, {
      bounds: CITY_BOUNDS.hyderabad,
    });
    expect(places).toEqual([
      { lat: 17.3916, lng: 78.3226, displayName: cinema.display_name, category: "amenity", type: "cinema" },
    ]);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("User-Agent")).toBe(
      "GrabMySeats/1.0 (+https://grabmyseats.com; support@grabmyseats.com)",
    );
    const params = new URL(url).searchParams;
    expect(params.get("countrycodes")).toBe("in");
    expect(params.get("bounded")).toBe("1");
    const { west, north, east, south } = CITY_BOUNDS.hyderabad;
    expect(params.get("viewbox")).toBe(`${west},${north},${east},${south}`);
  });

  it("caches a hit: the same query never goes out twice", async () => {
    respondWith([cinema]);
    const q = `cache hit ${randomUUID()}`;
    await nominatimSearch(q);
    const again = await nominatimSearch(q.toUpperCase());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(again).toHaveLength(1);
  });

  it("caches a miss too", async () => {
    respondWith([]);
    const q = `cache miss ${randomUUID()}`;
    expect(await nominatimSearch(q)).toEqual([]);
    expect(await nominatimSearch(q)).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("never caches a failure (network error or non-200 such as 429)", async () => {
    const q = `failure ${randomUUID()}`;
    fetchSpy.mockRejectedValueOnce(new Error("network down"));
    expect(await nominatimSearch(q)).toBeNull();
    respondWith({ error: "rate limited" }, 429);
    expect(await nominatimSearch(q)).toBeNull();
    respondWith([cinema]);
    expect(await nominatimSearch(q)).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("spaces requests at least 1 second apart", async () => {
    vi.stubEnv("NOMINATIM_MIN_INTERVAL_MS", "1000");
    const sentAt: number[] = [];
    fetchSpy.mockImplementation(async () => {
      sentAt.push(Date.now());
      return new Response("[]", { status: 200 });
    });

    await Promise.all([
      nominatimSearch(`spacing a ${randomUUID()}`),
      nominatimSearch(`spacing b ${randomUUID()}`),
    ]);
    sentAt.sort((a, b) => a - b);
    expect(sentAt).toHaveLength(2);
    expect(sentAt[1] - sentAt[0]).toBeGreaterThanOrEqual(950);
  });

  it("gives up (null, no request) rather than queue past maxWaitMs", async () => {
    vi.stubEnv("NOMINATIM_MIN_INTERVAL_MS", "3000");
    respondWith([]);
    await nominatimSearch(`queue first ${randomUUID()}`);
    const second = await nominatimSearch(`queue second ${randomUUID()}`, { maxWaitMs: 100 });
    expect(second).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("can't be configured below 1 request per second in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NOMINATIM_MIN_INTERVAL_MS", "0");
    const sentAt: number[] = [];
    fetchSpy.mockImplementation(async () => {
      sentAt.push(Date.now());
      return new Response("[]", { status: 200 });
    });
    await nominatimSearch(`prod floor a ${randomUUID()}`);
    await nominatimSearch(`prod floor b ${randomUUID()}`);
    expect(sentAt[1] - sentAt[0]).toBeGreaterThanOrEqual(950);
  });
});

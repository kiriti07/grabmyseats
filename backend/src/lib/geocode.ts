import { createHash } from "node:crypto";
import type { CityBounds } from "@grabmyseats/shared";
import { redis } from "./redis";

// OpenStreetMap Nominatim forward search - free, no API key. Its usage
// policy (https://operations.osmfoundation.org/policies/nominatim/) is
// followed here, not just acknowledged:
// - an identifying User-Agent with a contact address;
// - at most 1 request per second, enforced across every backend instance
//   through Redis (not per process);
// - results cached (30 days; "no result" for 1 day), so a venue is looked
//   up once, not once per seller;
// - no autocomplete: callers only search on an explicit action (see the
//   sell form), and our own endpoint is rate-limited per user.

const USER_AGENT = "GrabMySeats/1.0 (+https://grabmyseats.com; support@grabmyseats.com)";
const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const REQUEST_TIMEOUT_MS = 5000;
const HIT_TTL_SECONDS = 30 * 24 * 60 * 60;
const MISS_TTL_SECONDS = 24 * 60 * 60;
const THROTTLE_KEY = "geo:nominatim:next-slot";
const CACHE_PREFIX = "geo:nominatim:v1:";

// Overridable only to speed up tests; never below 1s in production.
function minIntervalMs(): number {
  const configured = Number(process.env.NOMINATIM_MIN_INTERVAL_MS);
  const value = Number.isFinite(configured) && configured >= 0 ? configured : 1000;
  return process.env.NODE_ENV === "production" ? Math.max(1000, value) : value;
}

export interface NominatimPlace {
  lat: number;
  lng: number;
  displayName: string;
  // OSM classification, e.g. category "amenity" + type "cinema", or
  // category "place" + type "suburb".
  category: string;
  type: string;
}

// Reserves the next 1-per-interval request slot shared by every backend
// process, atomically: returns how long to wait before sending, or -1 if
// that would exceed maxWaitMs (nothing is reserved then).
const RESERVE_SLOT = `
local now = tonumber(ARGV[1])
local interval = tonumber(ARGV[2])
local maxWait = tonumber(ARGV[3])
local nextSlot = tonumber(redis.call('GET', KEYS[1]) or '0')
local slot = math.max(now, nextSlot)
if slot - now > maxWait then return -1 end
redis.call('SET', KEYS[1], slot + interval, 'PX', interval + 60000)
return slot - now
`;

async function waitForSlot(maxWaitMs: number): Promise<boolean> {
  const wait = (await redis.eval(
    RESERVE_SLOT,
    1,
    THROTTLE_KEY,
    Date.now(),
    minIntervalMs(),
    Math.max(0, maxWaitMs),
  )) as number;
  if (wait < 0) return false;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  return true;
}

function cacheKey(params: URLSearchParams): string {
  return CACHE_PREFIX + createHash("sha1").update(params.toString()).digest("hex");
}

export interface NominatimSearchOptions {
  bounds?: CityBounds;
  // Upper bound on how long to queue for a request slot; past it the search
  // gives up (returns null) rather than hanging the seller's form.
  maxWaitMs?: number;
}

// Up to 5 matches for `query`, restricted to India and (when given) the
// city's bounding box. Returns [] for "no match" and null when the search
// couldn't run (throttle budget exceeded, network error, non-200) - only
// definite answers are cached.
export async function nominatimSearch(
  query: string,
  options: NominatimSearchOptions = {},
): Promise<NominatimPlace[] | null> {
  const params = new URLSearchParams({
    q: query.trim().toLowerCase(),
    format: "jsonv2",
    limit: "5",
    countrycodes: "in",
  });
  if (options.bounds) {
    const { west, north, east, south } = options.bounds;
    params.set("viewbox", `${west},${north},${east},${south}`);
    params.set("bounded", "1");
  }

  const key = cacheKey(params);
  const cached = await redis.get(key);
  if (cached !== null) return JSON.parse(cached) as NominatimPlace[];

  if (!(await waitForSlot(options.maxWaitMs ?? 4000))) return null;

  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const raw = (await res.json().catch(() => null)) as
    | { lat: string; lon: string; display_name: string; category?: string; type?: string }[]
    | null;
  if (!Array.isArray(raw)) return null;

  const places = raw
    .map((r) => ({
      lat: Number(r.lat),
      lng: Number(r.lon),
      displayName: r.display_name,
      category: r.category ?? "",
      type: r.type ?? "",
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

  await redis.set(
    key,
    JSON.stringify(places),
    "EX",
    places.length > 0 ? HIT_TTL_SECONDS : MISS_TTL_SECONDS,
  );
  return places;
}

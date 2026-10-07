import {
  CITY_BOUNDS,
  INDIAN_METRO_CITIES,
  cityIdForName,
  isWithinCityBounds,
} from "@grabmyseats/shared";
import type { GeocodePreview, LocationPrecision } from "@grabmyseats/shared";
import { prisma } from "../prisma";
import { nominatimSearch, type NominatimPlace } from "../geocode";
import { buildVenueQueries, normalizeVenueText, parseTheaterName } from "./venueQueries";

// Venue-table name similarity needed for a match (pg_trgm similarity, 0-1),
// the similarity required between the names' first words (the brand), and
// the locality similarity needed when both sides have a locality. The brand
// check is what stops names sharing generic words from matching - "ALLU
// Cinemas" vs "Asian Cinemas" at the same locality scores ~0.5 on the name
// alone - while still tolerating an OCR typo in a longer brand word.
const NAME_SIMILARITY_MIN = 0.45;
const BRAND_SIMILARITY_MIN = 0.6;
const LOCALITY_SIMILARITY_MIN = 0.5;
// Two venues scoring within this of each other is ambiguous (e.g. "PVR"
// with no locality, and several PVRs on file) - fall through to OSM.
const AMBIGUITY_MARGIN = 0.05;
// Total time one lookup may spend queueing for Nominatim's 1 req/sec slot
// across all its candidate queries, so the sell form never hangs.
const LOOKUP_BUDGET_MS = 6000;

interface VenueRow {
  id: string;
  displayName: string;
  lat: number;
  lng: number;
  name_sim: number;
  brand_sim: number;
  loc_sim: number | null;
}

// Best Venue-table match for a parsed name in a city, or null when there's
// none or it's ambiguous. The % prefilter is what uses the
// "Venue_normalizedName_trgm_idx" GiST index.
export async function findVenueMatch(
  cityId: string,
  normalizedName: string,
  normalizedLocality: string,
): Promise<VenueRow | null> {
  if (!normalizedName) return null;
  const brand = normalizedName.split(" ")[0];
  const rows = await prisma.$queryRaw<VenueRow[]>`
    SELECT id, "displayName", lat, lng,
      similarity("normalizedName", ${normalizedName}) AS name_sim,
      similarity(split_part("normalizedName", ' ', 1), ${brand}) AS brand_sim,
      CASE WHEN ${normalizedLocality} = '' OR locality = '' THEN NULL
           ELSE similarity(locality, ${normalizedLocality}) END AS loc_sim
    FROM "Venue"
    WHERE "cityId" = ${cityId} AND "normalizedName" % ${normalizedName}
    ORDER BY name_sim DESC
    LIMIT 10
  `;

  const scored = rows
    .filter((r) => r.name_sim >= NAME_SIMILARITY_MIN && r.brand_sim >= BRAND_SIMILARITY_MIN)
    // Both have a locality and they disagree: a different branch.
    .filter((r) => r.loc_sim === null || r.loc_sim >= LOCALITY_SIMILARITY_MIN)
    .map((r) => ({ row: r, score: r.name_sim + (r.loc_sim ?? 0) * 0.5 }))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[0].score - scored[1].score < AMBIGUITY_MARGIN) return null;
  return scored[0].row;
}

// Result types a locality search may land on: a named place or district,
// or a mall. Not roads or single buildings - a road can run for kilometres.
function isAreaPlace(p: NominatimPlace): boolean {
  return (
    p.category === "place" ||
    p.category === "landuse" ||
    (p.category === "boundary" && p.type === "administrative") ||
    (p.category === "shop" && p.type === "mall")
  );
}

function words(value: string): string[] {
  return normalizeVenueText(value).split(" ").filter(Boolean);
}

// Whether an OSM result mentions the locality: any of its longer words, or
// the whole locality when all its words are short ("GVK One").
function mentionsLocality(displayName: string, locality: string): boolean {
  const haystack = words(displayName);
  const significant = words(locality).filter((w) => w.length >= 4);
  if (significant.length === 0) {
    return ` ${haystack.join(" ")} `.includes(` ${normalizeVenueText(locality)} `);
  }
  return significant.some((w) => haystack.includes(w));
}

// What a candidate query's results may resolve to. Anything weaker is
// skipped - and if every candidate is skipped, the listing falls back to the
// city center (CITY) rather than keeping a wrong pin:
// - venue query -> EXACT only for exactly one OSM cinema whose own name
//   carries the venue's brand (first word) and which, when a locality is
//   known, mentions it. Two same-brand cinemas the locality can't tell apart
//   are ambiguous, not a match.
// - locality query -> AREA for the top area-type result (place, district,
//   mall) - never a road or a random building.
// The caller has already dropped results outside the city's bounds.
function pickPlace(
  places: NominatimPlace[],
  kind: "venue" | "locality",
  parsed: { name: string; locality: string | null },
): NominatimPlace | null {
  if (kind === "locality") return places.find(isAreaPlace) ?? null;

  const brand = words(parsed.name)[0];
  const cinemas = places.filter(
    (p) =>
      p.category === "amenity" &&
      p.type === "cinema" &&
      !!brand &&
      words(p.displayName.split(",")[0]).includes(brand) &&
      (!parsed.locality || mentionsLocality(p.displayName, parsed.locality)),
  );
  return cinemas.length === 1 ? cinemas[0] : null;
}

// Resolves a theater name + city: GrabMySeats' own Venue table first, then
// OpenStreetMap with each candidate query from buildVenueQueries in order.
// Everything is bounded to the city's area when the city is known, and no
// result outside it is ever returned. budgetMs caps the total time spent
// queueing for Nominatim's 1 request/second slot.
export async function lookupVenue(
  theaterName: string,
  cityName: string | null,
  options: { budgetMs?: number } = {},
): Promise<GeocodePreview> {
  const parsed = parseTheaterName(theaterName);
  const base = { cleanedName: parsed.name, locality: parsed.locality };
  const cityId = cityIdForName(cityName);
  const bounds = cityId ? CITY_BOUNDS[cityId] : undefined;

  if (cityId) {
    const match = await findVenueMatch(
      cityId,
      normalizeVenueText(parsed.name),
      normalizeVenueText(parsed.locality ?? ""),
    );
    // A seeded row with bad coordinates is ignored, not trusted.
    if (match && isWithinCityBounds(cityId, match.lat, match.lng)) {
      return {
        ...base,
        found: true,
        kind: "venue",
        approximate: false,
        source: "venue",
        lat: match.lat,
        lng: match.lng,
        displayName: match.displayName,
      };
    }
  }

  const deadline = Date.now() + (options.budgetMs ?? LOOKUP_BUDGET_MS);
  // City text only when the search can't be bounded to the city's area -
  // see buildVenueQueries.
  for (const candidate of buildVenueQueries(theaterName, bounds ? null : cityName)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const places = await nominatimSearch(candidate.q, { bounds, maxWaitMs: remaining });
    if (!places) continue;
    const inCity = cityId ? places.filter((p) => isWithinCityBounds(cityId, p.lat, p.lng)) : places;
    const place = pickPlace(inCity, candidate.kind, parsed);
    if (place) {
      return {
        ...base,
        found: true,
        kind: candidate.kind,
        approximate: candidate.kind === "locality",
        source: "osm",
        lat: place.lat,
        lng: place.lng,
        displayName: place.displayName,
      };
    }
  }

  return {
    ...base,
    found: false,
    kind: "none",
    approximate: false,
    source: null,
    lat: null,
    lng: null,
    displayName: null,
  };
}

export interface ResolvedListingLocation {
  lat: number;
  lng: number;
  precision: LocationPrecision;
  cityId: string;
  // "seller": a pin the seller confirmed (the only kind that's learned into
  // Venue - see lib/geo/venueLearning.ts).
  source: "seller" | "venue" | "osm" | "city";
}

// How long listing creation may spend on OpenStreetMap before settling for
// a coarser precision - creation should never feel stuck on location.
const LISTING_LOOKUP_BUDGET_MS = 4000;

// Where a new listing goes, for POST /api/listings. Never fails - every
// step that can't produce an in-city location just falls through:
// 1. a pin the seller confirmed, inside the city's bounds -> EXACT;
// 2. the Venue table, or exactly one matching OSM cinema -> EXACT;
// 3. the venue's locality (place/district/mall) -> AREA;
// 4. the city center -> CITY.
// Returns null only for an unknown city, which the caller rejects as a
// missing field before getting here.
export async function resolveListingLocation(input: {
  theaterName: string;
  cityName: string;
  pin: { lat: number; lng: number } | null;
}): Promise<ResolvedListingLocation | null> {
  const cityId = cityIdForName(input.cityName);
  const city = INDIAN_METRO_CITIES.find((c) => c.id === cityId);
  if (!cityId || !city) return null;

  if (input.pin && isWithinCityBounds(cityId, input.pin.lat, input.pin.lng)) {
    return { ...input.pin, precision: "EXACT", cityId, source: "seller" };
  }

  let preview: GeocodePreview | null = null;
  try {
    preview = await lookupVenue(input.theaterName, input.cityName, {
      budgetMs: LISTING_LOOKUP_BUDGET_MS,
    });
  } catch (err) {
    console.error("[venues] lookup failed; falling back to the city center", err);
  }

  if (
    preview &&
    preview.kind !== "none" &&
    preview.lat !== null &&
    preview.lng !== null &&
    isWithinCityBounds(cityId, preview.lat, preview.lng)
  ) {
    return {
      lat: preview.lat,
      lng: preview.lng,
      precision: preview.kind === "venue" ? "EXACT" : "AREA",
      cityId,
      source: preview.source === "venue" ? "venue" : "osm",
    };
  }

  return { lat: city.lat, lng: city.lng, precision: "CITY", cityId, source: "city" };
}

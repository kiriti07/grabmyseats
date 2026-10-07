import { CITY_BOUNDS, cityIdForName, isWithinCityBounds } from "@grabmyseats/shared";
import type { GeocodePreview } from "@grabmyseats/shared";
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

// A venue query's hit should be the cinema itself: an OSM cinema, or else a
// place whose name carries the venue's first word (e.g. a mall-listed "PVR
// ..." entry). A locality query takes the top result, whatever it is - it's
// approximate either way.
function pickPlace(
  places: NominatimPlace[],
  kind: "venue" | "locality",
  venueName: string,
): NominatimPlace | null {
  if (kind === "locality") return places[0] ?? null;
  const cinema = places.find((p) => p.category === "amenity" && p.type === "cinema");
  if (cinema) return cinema;
  const firstWord = normalizeVenueText(venueName).split(" ")[0];
  return (
    places.find((p) => firstWord && normalizeVenueText(p.displayName).split(" ").includes(firstWord)) ??
    null
  );
}

// Resolves a theater name + city: GrabMySeats' own Venue table first, then
// OpenStreetMap with each candidate query from buildVenueQueries in order.
// Everything is bounded to the city's area when the city is known.
export async function lookupVenue(theaterName: string, cityName: string | null): Promise<GeocodePreview> {
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
    if (match) {
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

  const deadline = Date.now() + LOOKUP_BUDGET_MS;
  for (const candidate of buildVenueQueries(theaterName, cityName ?? "")) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const places = await nominatimSearch(candidate.q, { bounds, maxWaitMs: remaining });
    if (!places) continue;
    const inCity = cityId ? places.filter((p) => isWithinCityBounds(cityId, p.lat, p.lng)) : places;
    const place = pickPlace(inCity, candidate.kind, parsed.name);
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

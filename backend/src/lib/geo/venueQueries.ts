// Turns a raw theater name - usually OCR'd off a booking screenshot, e.g.
// "PVR: Atrium Gachibowli, Hyderabad(AUDI 04)" or "ALLU Cinemas: Kokapet" -
// into its parts and an ordered list of geocoding queries to try (see
// lib/geo/venueLookup.ts). Booking apps format these as
// "<brand/venue>: <locality and/or screen tiers>", so the part after the
// colon is a locality as often as it's noise - it's classified, not thrown
// away.

// Screen-format/tier words: they describe a screen inside the venue, never
// the venue's location, and only make a place search worse.
const TIER_PATTERNS: RegExp[] = [
  /\bLUXE\b/gi,
  /\bIMAX\b/gi,
  /\b4DX\b/gi,
  /\bP\s*\[?\s*XL\s*\]?/gi, // PXL, P[XL]
  /\bScreen\s*X\b/gi,
  /\bMX4D\b/gi,
  /\bEPIQ\b/gi,
  /\bONYX\b/gi,
  /\bICE\b/gi,
  /\bGold\s*Class\b/gi,
  /\bDirector'?s\s*Cut\b/gi,
  /\bInsignia\b/gi,
  /\bRecliners?\b/gi,
  /\bDolby(?:\s*(?:Atmos|Cinema))?\b/gi,
];

// "(SCREEN 10)", "(AUDI 04)", "Screen 3", "Audi-2", "Scr 1", "Auditorium 5".
const SCREEN_SUFFIX = /\(?\s*\b(?:screen|scr|audi(?:torium)?)\b\s*[-#:.]?\s*\d+\s*\)?/gi;

// OCR truncation marks: "LUXE, ..." / "LUXE, …".
const ELLIPSIS = /\.{2,}|…/g;

// Names that place a venue in a city or region, but are never a usable
// locality: the metro names themselves and their aliases (Cyberabad is
// Hyderabad's IT-corridor/police-commissionerate name, not a neighbourhood
// a geocoder can pin), plus states and the country. Matched against whole,
// normalized parts. Real satellite localities (Gurugram, Noida,
// Secunderabad, Thane...) are deliberately not here.
const REGION_NAMES = new Set([
  "hyderabad", "cyberabad", "hyd",
  "mumbai", "bombay",
  "delhi", "new delhi", "ncr", "delhi ncr",
  "bengaluru", "bangalore",
  "chennai", "madras",
  "kolkata", "calcutta",
  "pune",
  "ahmedabad",
  "india", "telangana", "maharashtra", "karnataka", "tamil nadu", "west bengal",
  "gujarat", "haryana", "uttar pradesh",
]);

// Lowercase, punctuation to spaces, collapsed. The comparison/storage key
// for venue names and localities (Venue.normalizedName / .locality).
export function normalizeVenueText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function stripTiers(value: string): string {
  let out = value;
  for (const pattern of TIER_PATTERNS) out = out.replace(pattern, " ");
  return tidy(out);
}

// Collapses whitespace and trims stray separators left behind by removals.
function tidy(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:\-|/]+|[\s,;:\-|/]+$/g, "")
    .trim();
}

function isRegionName(part: string): boolean {
  return REGION_NAMES.has(normalizeVenueText(part));
}

export interface ParsedTheaterName {
  // The venue/brand name with tier words removed, e.g. "PVR Superplex Inorbit".
  name: string;
  // What's left of the part after the colon once tiers, screen/audi
  // suffixes and city/region names are removed, e.g. "Kokapet" - or null.
  locality: string | null;
  // Every meaningful part, tiers included, minus screen/audi suffixes, OCR
  // ellipses and city/region names - the "full name" query.
  fullParts: string[];
}

export function parseTheaterName(raw: string): ParsedTheaterName {
  const cleaned = raw.replace(SCREEN_SUFFIX, " ").replace(ELLIPSIS, " ");

  // "<venue>: <rest>" when there's a colon; otherwise "<venue>, <rest>".
  const colon = cleaned.indexOf(":");
  const splitAt = colon >= 0 ? colon : cleaned.indexOf(",");
  const head = tidy(splitAt >= 0 ? cleaned.slice(0, splitAt) : cleaned);
  const tail = splitAt >= 0 ? cleaned.slice(splitAt + 1) : "";

  const tailParts = tail
    .split(/[:,]/)
    .map(tidy)
    .filter((part) => part && !isRegionName(part));

  const localityParts = tailParts.map(stripTiers).filter(Boolean);
  const name = stripTiers(head) || head;

  return {
    name,
    locality: localityParts.length > 0 ? localityParts.join(", ") : null,
    fullParts: [head, ...tailParts].filter(Boolean),
  };
}

export interface VenueQuery {
  q: string;
  // "venue": looking for the venue itself. "locality": the area only - a hit
  // is approximate (see GeocodePreview.approximate).
  kind: "venue" | "locality";
}

// The queries to try, in order, stopping at the first acceptable result:
// 1. the full name plus city;
// 2. the name with the post-colon part as its locality, plus city;
// 3. the name without tier words, plus city - skipped when the name is a
//    single word and a locality exists, since a bare brand ("PVR, Hyderabad")
//    would just match whichever branch the geocoder ranks first;
// 4. the locality plus city alone (approximate).
// Identical queries are tried once.
export function buildVenueQueries(raw: string, city: string): VenueQuery[] {
  const { name, locality, fullParts } = parseTheaterName(raw);
  const withCity = (...parts: (string | null)[]) => [...parts, city].filter(Boolean).join(", ");

  const candidates: VenueQuery[] = [{ q: withCity(...fullParts), kind: "venue" }];
  if (locality) candidates.push({ q: withCity(name, locality), kind: "venue" });
  if (!(locality && !name.includes(" "))) candidates.push({ q: withCity(name), kind: "venue" });
  if (locality) candidates.push({ q: withCity(locality), kind: "locality" });

  const seen = new Set<string>();
  return candidates.filter(({ q }) => {
    const key = normalizeVenueText(q);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

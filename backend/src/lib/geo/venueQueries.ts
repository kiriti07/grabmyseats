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

// Words that say "this is the venue" - in a name with no colon/comma, what
// follows one is the locality ("ALLU Cinemas Kokapet").
const VENUE_TYPE_WORDS = new Set([
  "cinema", "cinemas", "multiplex", "theatre", "theatres", "theater", "theaters",
  "talkies", "cineplex",
]);

// Cinema chains whose booking names are "<chain> [format] <mall or area>"
// ("PVR Superplex Inorbit", "INOX GVK One"): the words after the chain and
// any format words are the locality.
const CHAIN_BRANDS = new Set(["pvr", "inox", "cinepolis", "miraj", "carnival", "asian", "mukta"]);
const CHAIN_FORMAT_WORDS = new Set(["superplex", "icon", "ecx", "playhouse", "a2"]);

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
  // The venue/brand name with tier words, city/region words and any locality
  // taken from inside it removed, e.g. "ALLU Cinemas" or "PVR Superplex".
  name: string;
  // The venue's area, e.g. "Kokapet" or "Inorbit" - from the part after the
  // colon/comma when there is one, otherwise from inside the name (see
  // splitLocalityFromName) - or null.
  locality: string | null;
  // Every meaningful part, tiers included, minus screen/audi suffixes, OCR
  // ellipses and city/region names - the "full name" query.
  fullParts: string[];
}

// Drops trailing city/region words: "PVR Superplex Inorbit Hyderabad" ->
// "PVR Superplex Inorbit". Only trailing ones - a city word inside a name
// ("Hyderabad Central Mall") is part of it.
function stripTrailingRegions(value: string): string {
  const words = value.split(" ").filter(Boolean);
  for (;;) {
    const two = words.slice(-2).join(" ");
    if (words.length > 2 && isRegionName(two)) words.splice(-2);
    else if (words.length > 1 && isRegionName(words[words.length - 1])) words.pop();
    else break;
  }
  return words.join(" ");
}

// A locality embedded in a name with no separator: the words after a venue
// type word ("ALLU Cinemas Kokapet" -> "ALLU Cinemas" + "Kokapet"), or for a
// cinema chain, the words after the chain and its format words ("PVR
// Superplex Inorbit" -> "PVR Superplex" + "Inorbit").
function splitLocalityFromName(name: string): { name: string; locality: string | null } {
  const words = name.split(" ").filter(Boolean);
  const lower = words.map((w) => normalizeVenueText(w));

  const typeAt = lower.findIndex((w) => VENUE_TYPE_WORDS.has(w));
  if (typeAt >= 0 && typeAt < words.length - 1) {
    return {
      name: words.slice(0, typeAt + 1).join(" "),
      locality: words.slice(typeAt + 1).join(" "),
    };
  }

  if (CHAIN_BRANDS.has(lower[0])) {
    let i = 1;
    while (
      i < words.length &&
      (CHAIN_FORMAT_WORDS.has(lower[i]) || VENUE_TYPE_WORDS.has(lower[i]))
    ) {
      i++;
    }
    if (i < words.length) {
      return { name: words.slice(0, i).join(" "), locality: words.slice(i).join(" ") };
    }
  }
  return { name, locality: null };
}

export function parseTheaterName(raw: string): ParsedTheaterName {
  const cleaned = raw.replace(SCREEN_SUFFIX, " ").replace(ELLIPSIS, " ");

  // "<venue>: <rest>" when there's a colon; otherwise "<venue>, <rest>".
  const colon = cleaned.indexOf(":");
  const splitAt = colon >= 0 ? colon : cleaned.indexOf(",");
  const head = stripTrailingRegions(tidy(splitAt >= 0 ? cleaned.slice(0, splitAt) : cleaned));
  const tail = splitAt >= 0 ? cleaned.slice(splitAt + 1) : "";

  const tailParts = tail
    .split(/[:,]/)
    .map(tidy)
    .filter((part) => part && !isRegionName(part));

  const tailLocality = tailParts.map(stripTiers).filter(Boolean).join(", ") || null;
  const headName = stripTiers(head) || head;
  // The part after the separator wins; only when it held no locality (none,
  // or only tiers/city names) is one looked for inside the name itself.
  const split = tailLocality
    ? { name: headName, locality: tailLocality }
    : splitLocalityFromName(headName);

  return {
    name: split.name,
    locality: split.locality,
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
// 1. the full name;
// 2. the name with its locality;
// 3. the name without tier words - skipped when the name is a single word
//    and a locality exists, since a bare brand ("PVR") would just match
//    whichever branch the geocoder ranks first;
// 4. the locality alone (approximate).
// cityText is appended only when the caller can't bound the search to the
// city's area: with a bounding box it's redundant, and harmful - venues just
// outside the municipal limits (Kokapet, in Ranga Reddy district) don't
// carry "Hyderabad" in their OSM address, so "Kokapet, Hyderabad" finds
// nothing while "Kokapet" does. Identical queries are tried once.
export function buildVenueQueries(raw: string, cityText: string | null = null): VenueQuery[] {
  const { name, locality, fullParts } = parseTheaterName(raw);
  const q = (...parts: (string | null)[]) => [...parts, cityText].filter(Boolean).join(", ");

  const candidates: VenueQuery[] = [{ q: q(...fullParts), kind: "venue" }];
  if (locality) candidates.push({ q: q(name, locality), kind: "venue" });
  if (!(locality && !name.includes(" "))) candidates.push({ q: q(name), kind: "venue" });
  if (locality) candidates.push({ q: q(locality), kind: "locality" });

  const seen = new Set<string>();
  return candidates.filter(({ q: query }) => {
    const key = normalizeVenueText(query);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

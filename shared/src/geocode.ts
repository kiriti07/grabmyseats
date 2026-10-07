// POST /api/listings/geocode response: a preview of where a theater name +
// city resolves to, so the seller can confirm it before submitting the
// listing. Always 200/success - "no match" is a normal outcome, not an API
// error.
// - kind "venue": the venue itself was found (from GrabMySeats' own Venue
//   table, or OpenStreetMap). The seller can still adjust the pin.
// - kind "locality": only the area (e.g. "Kokapet") resolved - lat/lng is
//   the locality, approximate is true, and the seller is asked to drag the
//   pin to the exact spot.
// - kind "none": nothing resolved; the seller places the pin from the city
//   center.
export type GeocodeKind = "venue" | "locality" | "none";

export interface GeocodePreview {
  // kind !== "none" - kept for older clients.
  found: boolean;
  kind: GeocodeKind;
  approximate: boolean;
  // Where the match came from: "venue" = a seller-confirmed/seeded Venue
  // row, "osm" = OpenStreetMap Nominatim. null when nothing was found.
  source: "venue" | "osm" | null;
  lat: number | null;
  lng: number | null;
  displayName: string | null;
  // The venue name with tier words and screen/audi suffixes removed - what
  // the manual search box is prefilled with.
  cleanedName: string;
  // The locality parsed out of the name, if any (e.g. "Kokapet").
  locality: string | null;
}

// POST /api/listings/geocode response: a preview of where a theater name +
// city would resolve to, so the seller can confirm it before submitting
// the listing (or fall back to the manual venue picker when found=false).
// Always 200/success - "no match" is a normal outcome, not an API error.
export interface GeocodePreview {
  found: boolean;
  lat: number | null;
  lng: number | null;
  displayName: string | null;
  cleanedName: string;
}

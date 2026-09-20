import { INDIAN_METRO_CITIES } from "@grabmyseats/shared";

// Overrides used only to seed the manual VenuePicker fallback map's initial
// view. INDIAN_METRO_CITIES' centroids are shared with other features
// (buyer "near me" search origin, city dropdowns) and shouldn't be nudged
// for this UI-only concern - a city gets an entry here only when its
// INDIAN_METRO_CITIES centroid sits far from where sellers actually list
// venues. Hyderabad's shared centroid is anchored to the old
// city/Koti/Sultan Bazar area, ~15-20km from the western IT corridor
// (Gachibowli/HITEC City/Kokapet) where a large share of venues are -
// Banjara Hills sits roughly between the two, cutting that gap in half.
const VENUE_PICKER_CENTER_OVERRIDES: Record<string, { lat: number; lng: number }> = {
  hyderabad: { lat: 17.4126, lng: 78.4482 },
};

export function getVenuePickerCityCenter(city: string): { lat: number; lng: number } {
  const match = INDIAN_METRO_CITIES.find((c) => c.name === city);
  if (!match) return INDIAN_METRO_CITIES[0];
  return VENUE_PICKER_CENTER_OVERRIDES[match.id] ?? match;
}

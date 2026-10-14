import { INDIAN_METRO_CITIES, VENUE_PICKER_CENTER_OVERRIDES } from "@grabmyseats/shared";

// Seeds the manual VenuePicker fallback map's initial view. INDIAN_METRO_CITIES'
// centroids are shared with other features (buyer "near me" search origin,
// city dropdowns) and shouldn't be nudged for this UI-only concern - a city
// gets an override only when its centroid sits far from where sellers
// actually list venues (see VENUE_PICKER_CENTER_OVERRIDES).
export function getVenuePickerCityCenter(city: string): { lat: number; lng: number } {
  const match = INDIAN_METRO_CITIES.find((c) => c.name === city);
  if (!match) return INDIAN_METRO_CITIES[0];
  return VENUE_PICKER_CENTER_OVERRIDES[match.id] ?? match;
}

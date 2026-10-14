import { INDIAN_METRO_CITIES, VENUE_PICKER_CENTER_OVERRIDES } from "@grabmyseats/shared";
import { haversineDistanceMeters } from "./haversine";

// A seller pin this close to a city's own center point is one they never
// moved: the sell form's venue map starts there when nothing was found, and
// the listing fallback (CITY precision) puts listings there. Such a pin says
// nothing about where the venue is, so it's never EXACT and never learned.
// Small enough that a real venue is very unlikely to fall inside it - and
// if one ever did, it would only lose precision, never get a wrong pin.
export const CITY_CENTER_RADIUS_METERS = 50;

// The city's INDIAN_METRO_CITIES centroid and, where it has one, the sell
// form's venue-map starting point.
function centerPoints(cityId: string): { lat: number; lng: number }[] {
  const city = INDIAN_METRO_CITIES.find((c) => c.id === cityId);
  const override = VENUE_PICKER_CENTER_OVERRIDES[cityId];
  return [city, override].filter((p): p is { lat: number; lng: number } => !!p);
}

export function isNearCityCenter(cityId: string, lat: number, lng: number): boolean {
  return centerPoints(cityId).some(
    (p) => haversineDistanceMeters(p.lat, p.lng, lat, lng) <= CITY_CENTER_RADIUS_METERS,
  );
}

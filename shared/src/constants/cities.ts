export interface IndianMetroCity {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface CityBounds {
  south: number;
  north: number;
  west: number;
  east: number;
}

// Generous rectangles around each metro area, including its satellite
// cities (Navi Mumbai/Thane, Gurugram/Noida/Faridabad/Ghaziabad,
// Secunderabad/Kokapet/Shamshabad, PCMC/Hinjewadi, Gandhinagar, Howrah/New
// Town). Used to bound venue geocoding to the selected city and to refuse
// seller-confirmed pins that land outside it (backend
// lib/geo/venueLearning.ts) - not for anything distance-sensitive.
export const CITY_BOUNDS: Record<string, CityBounds> = {
  mumbai: { south: 18.85, north: 19.45, west: 72.75, east: 73.2 },
  "delhi-ncr": { south: 28.3, north: 28.95, west: 76.8, east: 77.6 },
  bengaluru: { south: 12.75, north: 13.25, west: 77.35, east: 77.85 },
  hyderabad: { south: 17.2, north: 17.65, west: 78.15, east: 78.75 },
  chennai: { south: 12.75, north: 13.3, west: 79.95, east: 80.35 },
  kolkata: { south: 22.35, north: 22.8, west: 88.2, east: 88.55 },
  pune: { south: 18.35, north: 18.75, west: 73.65, east: 74.05 },
  ahmedabad: { south: 22.85, north: 23.25, west: 72.4, east: 72.75 },
};

export function isWithinCityBounds(cityId: string, lat: number, lng: number): boolean {
  const b = CITY_BOUNDS[cityId];
  return !!b && lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}

// The sell form and listing APIs carry the city's display name.
export function cityIdForName(name: string | null | undefined): string | null {
  return INDIAN_METRO_CITIES.find((c) => c.name === name)?.id ?? null;
}

export function cityNameForId(id: string | null | undefined): string | null {
  return INDIAN_METRO_CITIES.find((c) => c.id === id)?.name ?? null;
}

// Approximate city-center coordinates, used only as a search origin before
// a user's precise geolocation is available - not for anything
// distance-sensitive like the theater-proximity checks in the escrow flow.
export const INDIAN_METRO_CITIES: IndianMetroCity[] = [
  { id: "mumbai", name: "Mumbai", lat: 19.076, lng: 72.8777 },
  { id: "delhi-ncr", name: "Delhi NCR", lat: 28.6139, lng: 77.209 },
  { id: "bengaluru", name: "Bengaluru", lat: 12.9716, lng: 77.5946 },
  { id: "hyderabad", name: "Hyderabad", lat: 17.385, lng: 78.4867 },
  { id: "chennai", name: "Chennai", lat: 13.0827, lng: 80.2707 },
  { id: "kolkata", name: "Kolkata", lat: 22.5726, lng: 88.3639 },
  { id: "pune", name: "Pune", lat: 18.5204, lng: 73.8567 },
  { id: "ahmedabad", name: "Ahmedabad", lat: 23.0225, lng: 72.5714 },
];

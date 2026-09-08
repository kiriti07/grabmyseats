export interface IndianMetroCity {
  id: string;
  name: string;
  lat: number;
  lng: number;
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

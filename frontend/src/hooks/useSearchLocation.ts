import { useCallback, useEffect, useState } from "react";
import { INDIAN_METRO_CITIES } from "@grabmyseats/shared";
import { detectLocation, type Coordinates } from "@/lib/geolocation";

export type LocationSource = "detecting" | "geolocation" | "city" | "unresolved";

export interface SearchLocation {
  coords: Coordinates | null;
  source: LocationSource;
  selectedCityId: string | null;
  selectCity: (cityId: string) => void;
}

// Resolves the lat/lng used for /api/listings/search: tries browser
// geolocation first, and only falls back to "ask the user to pick a city"
// if that's denied or unavailable - never a silently-assumed default city.
export function useSearchLocation(): SearchLocation {
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [source, setSource] = useState<LocationSource>("detecting");
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    detectLocation().then((location) => {
      if (cancelled) return;
      if (location) {
        setCoords(location);
        setSource("geolocation");
      } else {
        setSource("unresolved");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectCity = useCallback((cityId: string) => {
    const city = INDIAN_METRO_CITIES.find((c) => c.id === cityId);
    if (!city) return;
    setSelectedCityId(cityId);
    setCoords({ lat: city.lat, lng: city.lng });
    setSource("city");
  }, []);

  return { coords, source, selectedCityId, selectCity };
}

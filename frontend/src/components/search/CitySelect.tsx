"use client";

import { INDIAN_METRO_CITIES } from "@grabmyseats/shared";
import type { LocationSource } from "@/hooks/useSearchLocation";

export function CitySelect({
  selectedCityId,
  source,
  onSelect,
}: {
  selectedCityId: string | null;
  source: LocationSource;
  onSelect: (cityId: string) => void;
}) {
  const placeholder =
    source === "detecting"
      ? "Detecting location..."
      : source === "geolocation"
        ? "Near you"
        : "Select your city";

  return (
    <select
      value={selectedCityId ?? ""}
      onChange={(e) => onSelect(e.target.value)}
      aria-label="City"
      className="w-full shrink-0 rounded-lg border border-line bg-surface px-3 py-3 font-sans text-sm text-foreground focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold sm:w-44"
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {INDIAN_METRO_CITIES.map((city) => (
        <option key={city.id} value={city.id}>
          {city.name}
        </option>
      ))}
    </select>
  );
}

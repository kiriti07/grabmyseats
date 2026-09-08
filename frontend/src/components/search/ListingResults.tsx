import Link from "next/link";
import type { ListingSearchResult } from "@grabmyseats/shared";
import type { Coordinates } from "@/lib/geolocation";
import type { CategoryFilter } from "./CategoryTabs";
import { formatShowtimeShort } from "@/lib/format";

export function ListingResults({
  listings,
  isLoading,
  error,
  coords,
  activeCategory,
  cityName,
}: {
  listings: ListingSearchResult[];
  isLoading: boolean;
  error: string | null;
  coords: Coordinates | null;
  // EVENT/SPORT search uses a wide (effectively city-wide) default radius
  // and relevance-first ordering (see GET /api/listings/search), so an
  // exact "X km away" reads as more precise than it actually is - shown as
  // the searched city instead when one's known, or omitted entirely
  // otherwise (e.g. browser geolocation, where no city name is known
  // client-side). Every result shares the currently active tab's category,
  // so this is a page-level flag, not a per-listing one.
  activeCategory: CategoryFilter;
  cityName: string | null;
}) {
  const deemphasizeDistance = activeCategory === "EVENT" || activeCategory === "SPORT";
  if (error) {
    return <p className="mt-6 text-center text-sm text-error">{error}</p>;
  }
  if (isLoading) {
    return <p className="mt-6 text-center text-sm text-muted">Searching...</p>;
  }
  if (listings.length === 0) {
    return (
      <p className="mt-6 text-center text-sm text-muted">
        No seats found nearby yet. Try a different city or search term.
      </p>
    );
  }

  return (
    <ul className="mt-6 flex w-full max-w-sm flex-col gap-3">
      {listings.map((listing) => (
        <li key={listing.id}>
          <Link
            href={
              coords
                ? `/buy/${listing.id}?lat=${coords.lat}&lng=${coords.lng}`
                : `/buy/${listing.id}`
            }
            className="block rounded-lg border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-gold"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-foreground">{listing.movieName}</p>
                <p className="text-sm text-muted">{listing.theaterName}</p>
              </div>
              <p className="whitespace-nowrap font-display text-lg tracking-wide text-gold">
                ₹{listing.pricePerSeat}
              </p>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted">
              <span>{formatShowtimeShort(listing.showtime)}</span>
              <span>
                {listing.availableSeats} seat{listing.availableSeats === 1 ? "" : "s"}
                {!deemphasizeDistance && ` · ${listing.distanceKm.toFixed(1)} km away`}
                {deemphasizeDistance && cityName && ` · ${cityName}`}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

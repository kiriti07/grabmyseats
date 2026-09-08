"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { INDIAN_METRO_CITIES, type Category, type ListingSearchResult } from "@grabmyseats/shared";
import { useSearchLocation } from "@/hooks/useSearchLocation";
import { CitySelect } from "@/components/search/CitySelect";
import { ListingResults } from "@/components/search/ListingResults";
import { CategoryTabs, type CategoryFilter } from "@/components/search/CategoryTabs";
import { NotifyMeCard } from "@/components/search/NotifyMeCard";
import { SearchBar } from "@/components/search/SearchBar";
import { ApiError, searchListings } from "@/lib/api";

const SEARCH_DEBOUNCE_MS = 400;

function BuyPageContent() {
  const searchParams = useSearchParams();
  const { coords, source, selectedCityId, selectCity } = useSearchLocation();

  // Prefilled by the home screen's search bar (?movieName=...) so landing
  // here from there runs the search immediately instead of on an empty box.
  const [movieName, setMovieName] = useState(() => searchParams.get("movieName") ?? "");
  const [category, setCategory] = useState<CategoryFilter>("ALL");
  const [listings, setListings] = useState<ListingSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Set right before a suggestion-select/Enter-submit changes `movieName`,
  // so the debounce effect below (which also depends on movieName) skips
  // the redundant re-search its own dependency change would otherwise
  // schedule 400ms after the immediate one this flag accompanies.
  const skipNextDebouncedSearchRef = useRef(false);

  const runSearch = useCallback(
    async (searchMovieName: string, searchCategory: CategoryFilter) => {
      if (!coords) return;
      setIsSearching(true);
      setSearchError(null);
      try {
        const { listings } = await searchListings({
          ...coords,
          movieName: searchMovieName,
          category: searchCategory === "ALL" ? undefined : (searchCategory as Category),
        });
        setListings(listings);
      } catch (err) {
        setSearchError(
          err instanceof ApiError ? err.message : "Couldn't load listings. Please try again.",
        );
      } finally {
        setIsSearching(false);
      }
    },
    [coords],
  );

  useEffect(() => {
    if (!coords) return;
    if (skipNextDebouncedSearchRef.current) {
      skipNextDebouncedSearchRef.current = false;
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    const timer = setTimeout(() => {
      runSearch(movieName, category);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [coords, movieName, category, runSearch]);

  // Selecting an autocomplete suggestion (or pressing Enter) shouldn't wait
  // out the typing debounce above - it runs the search right away.
  function handleSearchNow(text: string) {
    setMovieName(text);
    skipNextDebouncedSearchRef.current = true;
    runSearch(text, category);
  }

  // Only known when the buyer picked a city from the dropdown (source ===
  // "city") - browser geolocation gives raw coordinates with no city name
  // attached, so this is null in that case (ListingResults just omits the
  // city text then, rather than guessing).
  const cityName = selectedCityId
    ? (INDIAN_METRO_CITIES.find((c) => c.id === selectedCityId)?.name ?? null)
    : null;

  return (
    <main className="flex min-h-dvh flex-col items-center bg-background px-5 py-6">
      <header className="flex w-full max-w-sm items-center justify-between">
        <Link href="/" className="text-sm font-medium text-muted hover:text-foreground">
          ← Home
        </Link>
        <span className="font-display text-2xl tracking-wide text-gold">Buy Tickets</span>
      </header>

      <div className="flex w-full flex-1 flex-col items-center pt-8 text-center">
        <p className="max-w-xs text-sm text-muted">
          Search for showtimes near you and grab a seat someone else can&apos;t use.
        </p>

        <div className="mt-6 flex w-full max-w-sm flex-col gap-2 sm:flex-row">
          <SearchBar
            value={movieName}
            onChange={setMovieName}
            onSubmit={handleSearchNow}
            coords={coords}
            placeholder="Search movies or theaters"
            className="w-full sm:flex-1"
          />
          <CitySelect selectedCityId={selectedCityId} source={source} onSelect={selectCity} />
        </div>

        {!coords && source === "unresolved" && (
          <p className="mt-3 text-sm text-muted">
            Turn on location access or select your city above to see nearby seats.
          </p>
        )}

        <CategoryTabs value={category} onChange={setCategory} />

        <ListingResults
          listings={listings}
          isLoading={isSearching}
          error={searchError}
          coords={coords}
          activeCategory={category}
          cityName={cityName}
        />

        {!isSearching && !searchError && listings.length === 0 && coords && (
          <NotifyMeCard
            titleQuery={movieName}
            activeCategory={category}
            cityId={selectedCityId}
            coords={coords}
          />
        )}
      </div>
    </main>
  );
}

export default function BuyPage() {
  return (
    <Suspense fallback={null}>
      <BuyPageContent />
    </Suspense>
  );
}

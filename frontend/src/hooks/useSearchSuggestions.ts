import { useEffect, useState } from "react";
import type { Coordinates } from "@/lib/geolocation";
import { searchListings } from "@/lib/api";

const SUGGESTIONS_DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;
const MAX_TITLE_SUGGESTIONS = 5;
const MAX_SUGGESTIONS = 8;

export interface SearchSuggestion {
  type: "title" | "venue";
  value: string;
}

// Suggestions are drawn only from listings actually for sale right now (the
// same GET /api/listings/search a real search would hit, which after the
// theater-name-matching change matches on either field) - never a generic
// external movie database, which would suggest titles nobody's selling.
// Debounced separately from (and faster than) the /buy page's own
// full-results search, since a keystroke here should feel closer to instant.
export function useSearchSuggestions(
  query: string,
  coords: Coordinates | null,
): SearchSuggestion[] {
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!coords || trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { listings } = await searchListings({ ...coords, movieName: trimmed });
        if (cancelled) return;

        const lowerQuery = trimmed.toLowerCase();
        const titles: string[] = [];
        const venues: string[] = [];
        for (const listing of listings) {
          if (
            listing.movieName.toLowerCase().includes(lowerQuery) &&
            !titles.includes(listing.movieName)
          ) {
            titles.push(listing.movieName);
          }
          if (
            listing.theaterName.toLowerCase().includes(lowerQuery) &&
            !venues.includes(listing.theaterName)
          ) {
            venues.push(listing.theaterName);
          }
        }
        // A result that only cleared the backend's fuzzy (pg_trgm)
        // threshold - a typo, say - won't literally contain the query
        // text in either field, so neither loop above would catch it.
        // Surface it as a title suggestion anyway rather than silently
        // dropping a listing the server already told us matched.
        for (const listing of listings) {
          if (!titles.includes(listing.movieName) && !venues.includes(listing.theaterName)) {
            titles.push(listing.movieName);
          }
        }

        const combined: SearchSuggestion[] = [
          ...titles.slice(0, MAX_TITLE_SUGGESTIONS).map((value) => ({ type: "title" as const, value })),
          ...venues.map((value) => ({ type: "venue" as const, value })),
        ].slice(0, MAX_SUGGESTIONS);

        setSuggestions(combined);
      } catch {
        // Autocomplete is a convenience, not a critical path - a failed
        // suggestions fetch just means no dropdown, no user-facing error.
        if (!cancelled) setSuggestions([]);
      }
    }, SUGGESTIONS_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, coords]);

  return suggestions;
}

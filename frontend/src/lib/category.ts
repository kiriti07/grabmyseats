import type { Category } from "@grabmyseats/shared";

export const CATEGORY_LABEL: Record<Category, string> = {
  MOVIE: "Movie",
  EVENT: "Event",
  SPORT: "Sport",
};

// "Movie name" only for MOVIE, kept for continuity with the app's original
// copy - every other category gets the generic "Title" instead of forcing
// movie-specific wording onto a different ticket format. See the sell
// form's category selector.
export function titleFieldLabel(category: Category): string {
  return category === "MOVIE" ? "Movie name" : "Title";
}

// "Theater name" only for MOVIE; EVENT/SPORT get the generic "Venue".
export function venueFieldLabel(category: Category): string {
  return category === "MOVIE" ? "Theater name" : "Venue";
}

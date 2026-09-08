"use client";

import { useState } from "react";
import Link from "next/link";
import type { Category } from "@grabmyseats/shared";
import type { CategoryFilter } from "./CategoryTabs";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { INPUT_CLASS } from "@/lib/styles";
import { CATEGORY_LABEL } from "@/lib/category";
import { ApiError, createAlert } from "@/lib/api";

const ALL_CATEGORIES: Category[] = ["MOVIE", "EVENT", "SPORT"];

// Mirrors GET /api/listings/search's own category-aware defaults (see
// WIDE_RADIUS_KM in backend/src/routes/listings.ts) - EVENT/SPORT venues
// are sparse enough that a movie-theater-tight radius would miss most
// real matches.
const CATEGORY_DEFAULT_RADIUS_KM: Record<Category, number> = {
  MOVIE: 7,
  EVENT: 50,
  SPORT: 50,
};

// Shown when a search comes up empty - lets the buyer save it as a
// "Notify me" alert instead of just walking away. Pre-filled from the
// search that was just run, but every field stays editable (an alert
// doesn't have to exactly match the search that surfaced it - the buyer
// might realize they want a wider radius, or a different category,
// looking at the empty results).
export function NotifyMeCard({
  titleQuery: initialTitleQuery,
  activeCategory,
  cityId,
  coords,
}: {
  titleQuery: string;
  activeCategory: CategoryFilter;
  cityId: string | null;
  coords: { lat: number; lng: number };
}) {
  const initialCategory: Category = activeCategory === "ALL" ? "MOVIE" : activeCategory;

  const [isOpen, setIsOpen] = useState(false);
  const [titleQuery, setTitleQuery] = useState(initialTitleQuery);
  const [alertCategory, setAlertCategory] = useState<Category>(initialCategory);
  const [radiusKm, setRadiusKm] = useState(CATEGORY_DEFAULT_RADIUS_KM[initialCategory]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  function handleCategoryChange(next: Category) {
    setAlertCategory(next);
    setRadiusKm(CATEGORY_DEFAULT_RADIUS_KM[next]);
  }

  async function handleSubmit() {
    setError(null);
    if (!titleQuery.trim()) {
      setError("Enter what you're looking for");
      return;
    }
    setIsSubmitting(true);
    try {
      await createAlert({
        titleQuery: titleQuery.trim(),
        cityId: cityId ?? undefined,
        lat: coords.lat,
        lng: coords.lng,
        radiusKm,
        category: alertCategory,
      });
      setCreated(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (created) {
    return (
      <div className="mt-6 w-full max-w-sm rounded-lg border border-line bg-surface p-4 text-center">
        <p className="text-sm text-success">You&apos;ll get a text when a match shows up ✓</p>
        <Link
          href="/account/alerts"
          className="mt-2 inline-block text-xs font-medium text-gold hover:text-gold-dim"
        >
          Manage alerts →
        </Link>
      </div>
    );
  }

  if (!isOpen) {
    return (
      <div className="mt-6 w-full max-w-sm text-center">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium text-gold hover:border-gold"
        >
          Notify me when tickets become available
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 w-full max-w-sm rounded-lg border border-line bg-surface p-4 text-left">
      <p className="text-sm font-medium text-foreground">Notify me</p>
      <p className="mt-1 text-xs text-muted">
        We&apos;ll text you as soon as a matching listing shows up.
      </p>

      <div className="mt-3">
        <label htmlFor="alertTitle" className="mb-1 block text-xs font-medium text-foreground">
          What are you looking for?
        </label>
        <input
          id="alertTitle"
          value={titleQuery}
          onChange={(e) => setTitleQuery(e.target.value)}
          placeholder="Movie, event, or match name"
          className={INPUT_CLASS}
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {ALL_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => handleCategoryChange(c)}
            className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
              alertCategory === c
                ? "border-gold bg-gold/10 text-gold"
                : "border-line bg-surface text-muted hover:border-gold/50"
            }`}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      <div className="mt-3">
        <label htmlFor="alertRadius" className="mb-1 block text-xs font-medium text-foreground">
          Radius: {radiusKm} km
        </label>
        <input
          id="alertRadius"
          type="range"
          min={1}
          max={100}
          step={1}
          value={radiusKm}
          onChange={(e) => setRadiusKm(Number(e.target.value))}
          className="w-full accent-gold"
        />
      </div>

      <ErrorText>{error}</ErrorText>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          disabled={isSubmitting}
          className="flex-1 rounded-lg border border-line px-3 py-2 text-sm font-medium text-foreground hover:border-gold disabled:opacity-60"
        >
          Cancel
        </button>
        <div className="flex-1">
          <Button onClick={handleSubmit} isLoading={isSubmitting}>
            Create alert
          </Button>
        </div>
      </div>
    </div>
  );
}

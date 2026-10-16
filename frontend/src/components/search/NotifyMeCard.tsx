"use client";

import { useState } from "react";
import Link from "next/link";
import type { Category, TicketAlertSaveResult } from "@grabmyseats/shared";
import type { CategoryFilter } from "./CategoryTabs";
import { AlertForm } from "@/components/alerts/AlertForm";
import { AlertMatchList } from "@/components/alerts/AlertMatchList";

// Shown when a search comes up empty - lets the buyer save it as a ticket
// alert instead of walking away. Pre-filled from the search, every field
// editable. "Near me" is only offered for a real location (geolocation),
// not a city picked from the list - that becomes "a city" instead.
export function NotifyMeCard({
  titleQuery,
  activeCategory,
  cityId,
  coords,
}: {
  titleQuery: string;
  activeCategory: CategoryFilter;
  cityId: string | null;
  coords: { lat: number; lng: number };
}) {
  const category: Category = activeCategory === "ALL" ? "MOVIE" : activeCategory;
  const [isOpen, setIsOpen] = useState(false);
  const [saved, setSaved] = useState<TicketAlertSaveResult | null>(null);

  if (saved) {
    return (
      <div className="mt-6 w-full max-w-sm rounded-lg border border-line bg-surface p-4 text-left">
        <p className="text-sm text-success">Alert saved ✓</p>
        <p className="mt-1 text-xs text-muted">New matches will show in My Alerts.</p>
        {saved.currentMatches.length > 0 && (
          <div className="mt-3">
            <p className="mb-2 text-xs font-medium text-foreground">Already available</p>
            <AlertMatchList matches={saved.currentMatches} />
          </div>
        )}
        <Link href="/account/alerts" className="mt-3 inline-block text-xs font-medium text-gold hover:text-gold-dim">
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
    <div className="mt-6 w-full max-w-sm rounded-lg border border-line bg-surface p-4">
      <p className="text-sm font-medium text-foreground">Notify me</p>
      <p className="mb-3 mt-1 text-xs text-muted">Tell us what you need and we&apos;ll let you know when it&apos;s listed.</p>
      <AlertForm
        defaults={{ titleQuery, category, cityId }}
        nearPoint={cityId ? null : coords}
        onSaved={setSaved}
        onCancel={() => setIsOpen(false)}
      />
    </div>
  );
}

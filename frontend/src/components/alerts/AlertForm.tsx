"use client";

import { useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import {
  ALERT_MAX_DATES,
  ALERT_MAX_SEATS,
  ALERT_RADIUS_DEFAULT_KM,
  INDIAN_METRO_CITIES,
  alertDatesProblem,
  alertLatestDate,
  alertToday,
  type Category,
  type TicketAlert,
  type TicketAlertSaveResult,
} from "@grabmyseats/shared";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { INPUT_CLASS } from "@/lib/styles";
import { CATEGORY_LABEL } from "@/lib/category";
import { calendarDate, dateFromCalendar } from "@/lib/showtime";
import { shortAlertDate, toggleAlertDate } from "@/lib/alertDates";
import { ApiError, createAlert, updateAlert } from "@/lib/api";
import { useSearchSuggestions } from "@/hooks/useSearchSuggestions";

const CATEGORIES: Category[] = ["MOVIE", "EVENT", "SPORT"];
const NAME_LABEL: Record<Category, string> = { MOVIE: "Movie name", EVENT: "Event name", SPORT: "Match" };
const NAME_PLACEHOLDER: Record<Category, string> = {
  MOVIE: "e.g. Pushpa 2: The Rule",
  EVENT: "e.g. Coldplay: Music of the Spheres",
  SPORT: "e.g. RCB vs CSK",
};

type Place = "near" | "city" | "anywhere";

// Create or edit a ticket alert: event, how many tickets, one or more dates,
// and where - near a point (only when the page knows one: the buyer's
// search location, or the alert's own), in a city, or anywhere. Event names
// suggest titles of matching live listings, so the buyer can pick the exact
// name sellers use (matching is strict - see backend lib/eventName.ts).
export function AlertForm({
  initial,
  defaults,
  nearPoint,
  onSaved,
  onCancel,
}: {
  initial?: TicketAlert;
  defaults?: { titleQuery?: string; category?: Category; cityId?: string | null };
  // The buyer's search location, when the page has one.
  nearPoint?: { lat: number; lng: number } | null;
  onSaved: (result: TicketAlertSaveResult) => void;
  onCancel?: () => void;
}) {
  const point = initial && initial.lat !== null && initial.lng !== null ? { lat: initial.lat, lng: initial.lng } : nearPoint ?? null;
  const [titleQuery, setTitleQuery] = useState(initial?.titleQuery ?? defaults?.titleQuery ?? "");
  const [category, setCategory] = useState<Category>(initial?.category ?? defaults?.category ?? "MOVIE");
  const [seats, setSeats] = useState(initial?.seatsWanted ?? 1);
  const today = alertToday();
  const [dates, setDates] = useState<string[]>((initial?.dates ?? []).filter((d) => d >= today));
  const [place, setPlace] = useState<Place>(
    initial ? (initial.lat !== null ? "near" : initial.cityId ? "city" : "anywhere") : point ? "near" : defaults?.cityId ? "city" : "anywhere",
  );
  const [cityId, setCityId] = useState(initial?.cityId ?? defaults?.cityId ?? INDIAN_METRO_CITIES[0].id);
  const [radiusKm, setRadiusKm] = useState(initial?.radiusKm ?? ALERT_RADIUS_DEFAULT_KM[category]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = useSearchSuggestions(titleQuery, point).filter((s) => s.type === "title").slice(0, 5);
  const latest = alertLatestDate();

  function changeCategory(next: Category) {
    setCategory(next);
    if (!initial) setRadiusKm(ALERT_RADIUS_DEFAULT_KM[next]);
  }

  async function save() {
    setError(null);
    if (!titleQuery.trim()) return setError(`Enter the ${NAME_LABEL[category].toLowerCase()}`);
    const datesProblem = alertDatesProblem(dates);
    if (datesProblem) return setError(datesProblem);

    const input = {
      titleQuery: titleQuery.trim(),
      category,
      seatsWanted: seats,
      dates,
      ...(place === "near" && point
        ? { lat: point.lat, lng: point.lng, radiusKm, cityId: null }
        : place === "city"
          ? { cityId, lat: null, lng: null }
          : { cityId: null, lat: null, lng: null }),
    };
    setIsSaving(true);
    try {
      onSaved(initial ? await updateAlert(initial.id, input) : await createAlert(input));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  const choice = (active: boolean) =>
    `rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
      active ? "border-gold bg-gold/10 text-gold" : "border-line bg-surface text-muted hover:border-gold/50"
    }`;

  return (
    <div className="flex flex-col gap-4 text-left">
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Category">
        {CATEGORIES.map((c) => (
          <button key={c} type="button" aria-pressed={category === c} onClick={() => changeCategory(c)} className={choice(category === c)}>
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      <div className="relative">
        <label htmlFor="alertTitle" className="mb-1 block text-xs font-medium text-foreground">
          {NAME_LABEL[category]}
        </label>
        <input
          id="alertTitle"
          value={titleQuery}
          onChange={(e) => {
            setTitleQuery(e.target.value);
            setShowSuggestions(true);
          }}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder={NAME_PLACEHOLDER[category]}
          autoComplete="off"
          className={INPUT_CLASS}
        />
        {showSuggestions && suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface-raised shadow-lg">
            {suggestions.map((s) => (
              <li key={s.value}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setTitleQuery(s.value);
                    setShowSuggestions(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-gold/10"
                >
                  {s.value}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-muted">Include any number - &quot;Jailer&quot; won&apos;t match &quot;Jailer 2&quot;.</p>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-foreground">Tickets needed</p>
        <div className="flex items-center gap-3">
          <button type="button" aria-label="Fewer tickets" onClick={() => setSeats((n) => Math.max(1, n - 1))} disabled={seats <= 1}
            className="h-10 w-10 rounded-lg border border-line text-lg text-foreground disabled:opacity-40">−</button>
          <span className="min-w-6 text-center text-base font-semibold text-foreground" aria-live="polite">{seats}</span>
          <button type="button" aria-label="More tickets" onClick={() => setSeats((n) => Math.min(ALERT_MAX_SEATS, n + 1))} disabled={seats >= ALERT_MAX_SEATS}
            className="h-10 w-10 rounded-lg border border-line text-lg text-foreground disabled:opacity-40">+</button>
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-foreground">Dates (up to {ALERT_MAX_DATES})</p>
        <div className="overflow-x-auto rounded-lg border border-line bg-surface p-2">
          <DayPicker
            mode="multiple"
            className="showtime-calendar mx-auto w-max"
            today={calendarDate(today)}
            selected={dates.map(calendarDate)}
            startMonth={calendarDate(today)}
            endMonth={calendarDate(latest)}
            disabled={[{ before: calendarDate(today) }, { after: calendarDate(latest) }]}
            onDayClick={(day, modifiers) => {
              if (!modifiers.disabled) setDates((prev) => toggleAlertDate(prev, dateFromCalendar(day)));
            }}
          />
        </div>
        {dates.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Chosen dates">
            {dates.map((d) => (
              <li key={d}>
                <button type="button" onClick={() => setDates((prev) => toggleAlertDate(prev, d))}
                  aria-label={`Remove ${shortAlertDate(d)}`}
                  className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-medium text-gold">
                  {shortAlertDate(d)} ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-foreground">Where</p>
        <div className={`grid gap-2 ${point ? "grid-cols-3" : "grid-cols-2"}`} role="group" aria-label="Where">
          {point && (
            <button type="button" aria-pressed={place === "near"} onClick={() => setPlace("near")} className={choice(place === "near")}>Near me</button>
          )}
          <button type="button" aria-pressed={place === "city"} onClick={() => setPlace("city")} className={choice(place === "city")}>A city</button>
          <button type="button" aria-pressed={place === "anywhere"} onClick={() => setPlace("anywhere")} className={choice(place === "anywhere")}>Anywhere</button>
        </div>
        {place === "near" && point && (
          <div className="mt-2">
            <label htmlFor="alertRadius" className="mb-1 block text-xs text-muted">Within {radiusKm} km</label>
            <input id="alertRadius" type="range" min={1} max={100} step={1} value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))} className="w-full accent-gold" />
          </div>
        )}
        {place === "city" && (
          <select aria-label="City" value={cityId} onChange={(e) => setCityId(e.target.value)} className={`mt-2 ${INPUT_CLASS}`}>
            {INDIAN_METRO_CITIES.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      <ErrorText>{error}</ErrorText>

      <div className="flex gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={isSaving}
            className="flex-1 rounded-lg border border-line px-3 py-2 text-sm font-medium text-foreground hover:border-gold disabled:opacity-60">
            Cancel
          </button>
        )}
        <div className="flex-1">
          <Button onClick={save} isLoading={isSaving}>{initial ? "Save changes" : "Create alert"}</Button>
        </div>
      </div>
    </div>
  );
}

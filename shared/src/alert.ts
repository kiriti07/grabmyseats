import type { Category } from "./listing";
import { SHOWTIME_UTC_OFFSET_MINUTES } from "./showtime";

// Ticket alert ("Notify me") - see backend routes/alerts.ts and
// jobs/matchAlerts.ts. A buyer picks an event, how many tickets, one or more
// show dates, and optionally a radius or a city; matching listings are shown
// in My Alerts and pushed to the Android app.

export const ALERT_MAX_ACTIVE = 10;
export const ALERT_MAX_DATES = 14;
export const ALERT_MAX_SEATS = 10;
// Same window the sell form allows for showtimes (frontend lib/showtime.ts).
export const ALERT_MAX_DAYS_AHEAD = 183;
export const ALERT_RADIUS_DEFAULT_KM: Record<Category, number> = { MOVIE: 7, EVENT: 50, SPORT: 50 };

export type TicketAlertStatus = "active" | "paused" | "expired";

export interface TicketAlert {
  id: string;
  titleQuery: string;
  category: Category;
  seatsWanted: number;
  // "YYYY-MM-DD" India dates; empty only on alerts made before dates
  // existed, which match any date.
  dates: string[];
  cityId: string | null;
  // null when the alert isn't limited to a radius (city-only or anywhere).
  lat: number | null;
  lng: number | null;
  radiusKm: number;
  isActive: boolean;
  status: TicketAlertStatus;
  createdAt: string;
  expiresAt: string;
}

// A listing that matched an alert - only what the buyer needs to decide to
// open it; nothing about the seller.
export interface TicketAlertMatch {
  listingId: string;
  movieName: string;
  showtime: string;
  freeSeats: number;
  pricePerSeat: number;
  cityId: string | null;
  // false once it's sold, withdrawn, expired or no longer has enough seats.
  available: boolean;
  seen: boolean;
}

export interface TicketAlertWithMatches extends TicketAlert {
  matches: TicketAlertMatch[];
}

// POST /api/alerts and PATCH /api/alerts/:id. Place: lat+lng (with an
// optional radiusKm) = within that distance; only cityId = that city;
// neither = anywhere.
export interface TicketAlertInput {
  titleQuery: string;
  category: Category;
  seatsWanted: number;
  dates: string[];
  cityId?: string | null;
  lat?: number | null;
  lng?: number | null;
  radiusKm?: number | null;
}

// POST/PATCH response: the alert, plus listings that already match it -
// shown on screen then, never pushed.
export interface TicketAlertSaveResult {
  alert: TicketAlert;
  currentMatches: TicketAlertMatch[];
}

// Today's date in India, "YYYY-MM-DD".
export function alertToday(nowMs: number = Date.now()): string {
  return new Date(nowMs + SHOWTIME_UTC_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

export function alertLatestDate(nowMs: number = Date.now()): string {
  const d = new Date(`${alertToday(nowMs)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + ALERT_MAX_DAYS_AHEAD);
  return d.toISOString().slice(0, 10);
}

// Why these dates can't be used for an alert, or null when they're fine:
// 1 to ALERT_MAX_DATES real calendar dates, none before today or past the
// window. Duplicates are ignored (normalizeAlertDates drops them).
export function alertDatesProblem(dates: unknown, nowMs: number = Date.now()): string | null {
  if (!Array.isArray(dates) || dates.length === 0) return "Pick at least one date";
  const unique = normalizeAlertDates(dates as string[]);
  if (unique.length !== new Set(dates).size || unique.length === 0) return "Dates must be real calendar dates";
  if (unique.length > ALERT_MAX_DATES) return `Pick at most ${ALERT_MAX_DATES} dates`;
  if (unique[0] < alertToday(nowMs)) return "Dates can't be in the past";
  if (unique[unique.length - 1] > alertLatestDate(nowMs)) return "That date is too far ahead";
  return null;
}

// Valid "YYYY-MM-DD" dates only, de-duplicated and sorted.
export function normalizeAlertDates(dates: string[]): string[] {
  const valid = dates.filter((d) => {
    if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    const parsed = new Date(`${d}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d;
  });
  return [...new Set(valid)].sort();
}

// The moment an alert stops: the end of its last date, India time.
export function alertExpiresAt(dates: string[]): Date {
  const sorted = [...dates].sort();
  const last = sorted[sorted.length - 1];
  return new Date(new Date(`${last}T23:59:59.999Z`).getTime() - SHOWTIME_UTC_OFFSET_MINUTES * 60_000);
}

// Temporary: the old "Notify me" request shape, still used by the frontend
// until its alert screens move to TicketAlertInput (next commit).
export interface CreateTicketAlertInput {
  titleQuery: string;
  cityId?: string;
  lat: number;
  lng: number;
  radiusKm?: number;
  category?: Category;
}

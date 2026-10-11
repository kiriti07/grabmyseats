import { isShowtimeInFuture, showtimeClockNow } from "@grabmyseats/shared";

// The showtime picker's conversions (components/sell/ShowtimePicker.tsx).
// What the seller picks is India time (IST), whatever the device's own
// timezone is, and is stored with the same numbers in the UTC fields - see
// shared/src/showtime.ts. Everything here is field arithmetic on Date.UTC /
// getUTC*, so the device timezone never enters into it; the only
// exception is the calendar-day bridge at the bottom, which is
// self-cancelling.

// "About 6 months" - the last day the calendar lets a seller pick.
export const SHOWTIME_MAX_DAYS_AHEAD = 183;
export const SHOWTIME_MINUTE_STEP = 5;

export type Meridiem = "AM" | "PM";

// A showtime as the picker holds it: the IST date and a 12-hour clock.
export interface ShowtimeParts {
  date: string; // YYYY-MM-DD
  hour12: number; // 1-12
  minute: number; // 0-59
  meridiem: Meridiem;
}

const pad = (n: number) => String(n).padStart(2, "0");

function isoDateOf(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function parseIsoDate(date: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return { y, m, d };
}

// Picker -> stored value, e.g. 2026-09-18 10:30 PM -> "2026-09-18T22:30:00.000Z".
export function partsToShowtimeIso(parts: ShowtimeParts): string | null {
  const date = parseIsoDate(parts.date);
  const { hour12, minute, meridiem } = parts;
  if (!date || !Number.isInteger(hour12) || hour12 < 1 || hour12 > 12) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  const hour24 = (hour12 % 12) + (meridiem === "PM" ? 12 : 0);
  return new Date(Date.UTC(date.y, date.m - 1, date.d, hour24, minute)).toISOString();
}

// Stored value -> picker. null for anything that isn't a valid date.
export function showtimeIsoToParts(iso: string): ShowtimeParts | null {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return null;
  const hour24 = d.getUTCHours();
  return {
    date: isoDateOf(d),
    hour12: hour24 % 12 === 0 ? 12 : hour24 % 12,
    minute: d.getUTCMinutes(),
    meridiem: hour24 < 12 ? "AM" : "PM",
  };
}

// Today's date in India.
export function istToday(nowMs: number = Date.now()): string {
  return isoDateOf(showtimeClockNow(nowMs));
}

export function addDays(date: string, days: number): string {
  const p = parseIsoDate(date);
  if (!p) throw new Error(`Not a YYYY-MM-DD date: ${date}`);
  return isoDateOf(new Date(Date.UTC(p.y, p.m - 1, p.d + days)));
}

export function latestShowtimeDate(nowMs: number = Date.now()): string {
  return addDays(istToday(nowMs), SHOWTIME_MAX_DAYS_AHEAD);
}

// The inline message for a picked (complete) showtime, or null if it's fine.
export function showtimeProblem(iso: string, nowMs: number = Date.now()): string | null {
  if (!isShowtimeInFuture(iso, nowMs)) {
    return "This showtime has already passed. Pick a later date or time.";
  }
  if (isoDateOf(new Date(iso)) > latestShowtimeDate(nowMs)) {
    return "Showtimes can be at most 6 months ahead. Check the date.";
  }
  return null;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Fri, 18 Sep 2026" for a YYYY-MM-DD date. Built by hand: Intl's output
// differs between browsers and Node versions.
export function formatShowtimeDate(date: string): string {
  const p = parseIsoDate(date);
  if (!p) return "";
  const weekday = WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
  return `${weekday}, ${p.d} ${MONTHS[p.m - 1]} ${p.y}`;
}

// The calendar widget (react-day-picker) works in Date objects at the
// device's local midnight. These two only build and read those with the
// matching local constructor/getters, so the y/m/d numbers survive in any
// device timezone - no instant is ever derived from them.
export function calendarDate(date: string): Date {
  const p = parseIsoDate(date);
  if (!p) throw new Error(`Not a YYYY-MM-DD date: ${date}`);
  return new Date(p.y, p.m - 1, p.d);
}

export function dateFromCalendar(day: Date): string {
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

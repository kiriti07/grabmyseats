// Showtimes have no real timezone anywhere in this app - they're stored and
// transmitted as literal wall-clock values wearing a "Z" suffix with no
// actual UTC conversion ever applied (see frontend/src/lib/datetimeLocal.ts
// and backend/src/lib/parseListingText.ts). `timeZone: "UTC"` here is what
// keeps display consistent with that: it renders the ISO string's numbers
// verbatim instead of letting the browser reinterpret them in the viewer's
// local timezone (which would double-apply an offset that was never really
// there, e.g. an IST browser shifting 22:30 to 4:00 the next day).
export function formatShowtimeShort(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    timeZone: "UTC",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatShowtimeFull(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTimeOnly(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  });
}

// This app has no concept of theater timezone anywhere - showtimes are
// treated as literal wall-clock values with no offset math applied at any
// point (see backend/src/lib/parseListingText.ts). These two helpers keep
// that consistent for the <input type="datetime-local"> in the sell form:
// the value's numbers are stored and read back byte-for-byte as UTC,
// regardless of the seller's or the server's actual local timezone.
export function isoToDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function datetimeLocalValueToIso(value: string): string {
  return `${value}:00.000Z`;
}

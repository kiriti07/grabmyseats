// Showtimes are India-time wall-clock values stored in the UTC fields with
// no offset math (see shared/src/showtime.ts and
// backend/src/lib/parseListingText.ts). These two helpers convert between
// that stored value and a "YYYY-MM-DDTHH:mm" string, byte-for-byte,
// regardless of the device's or the server's timezone. The sell forms now
// use ShowtimePicker (lib/showtime.ts), which follows the same convention;
// format.test.ts keeps these as the reference round-trip.
export function isoToDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function datetimeLocalValueToIso(value: string): string {
  return `${value}:00.000Z`;
}

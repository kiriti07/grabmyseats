import { describe, expect, it } from "vitest";
import { datetimeLocalValueToIso, isoToDatetimeLocalValue } from "./datetimeLocal";
import { formatDateShort, formatShowtimeFull, formatShowtimeShort, formatTimeOnly } from "./format";

// Regression test for a bug where listings displayed a showtime shifted by
// the viewer's local timezone offset (e.g. +5:30 for IST), because
// formatShowtimeFull/Short (and friends) formatted the stored ISO string
// via `toLocaleString(undefined, {...})` with no `timeZone` pinned - letting
// the browser reinterpret the app's timezone-naive wall-clock value in its
// own local zone. Showtimes have no real timezone anywhere in this app (see
// datetimeLocal.ts), so display must render the ISO string's numbers
// verbatim, with zero offset math, regardless of viewer timezone.
describe("showtime save -> display round-trip", () => {
  it("displays exactly what the seller typed into the datetime-local input, with no offset drift", () => {
    // What a seller typing "18/09/2026, 22:30" into <input type="datetime-local"> produces.
    const datetimeLocalValue = "2026-09-18T22:30";

    // What the sell form sends to the backend.
    const sentToBackend = datetimeLocalValueToIso(datetimeLocalValue);
    expect(sentToBackend).toBe("2026-09-18T22:30:00.000Z");

    // The backend stores this in a timezone-naive TIMESTAMP(3) column and
    // hands the same instant back as an ISO string in API responses
    // (backend/src/lib/serialize.ts: `listing.showtime.toISOString()`), so
    // the value a listing card/my-listings page receives is unchanged.
    const showtimeFromApi = sentToBackend;

    // Regression guard: must NOT drift to "Sat 19 Sept" / next-day hours.
    expect(formatShowtimeFull(showtimeFromApi)).toBe("Fri, Sep 18, 10:30 PM");
    expect(formatShowtimeShort(showtimeFromApi)).toBe("Fri 10:30 PM");
    expect(formatTimeOnly(showtimeFromApi)).toBe("10:30 PM");
    expect(formatDateShort(showtimeFromApi)).toBe("Sep 18");
  });

  it("round-trips through the edit form's datetime-local prefill unchanged", () => {
    const original = "2026-09-18T22:30";
    const iso = datetimeLocalValueToIso(original);

    // my-listings' edit form prefills the <input type="datetime-local">
    // from the API's ISO string - this must reproduce the exact value the
    // seller originally typed, not a timezone-shifted one.
    expect(isoToDatetimeLocalValue(iso)).toBe(original);
  });

  it("does not drift across a real IST (+5:30) boundary case", () => {
    // 22:30 UTC-labeled-but-wall-clock is deliberately chosen because it's
    // the exact case reported: an IST browser (UTC+5:30) applying its own
    // offset on top would roll this into the next day at 04:00.
    const iso = "2026-09-18T22:30:00.000Z";
    expect(formatShowtimeFull(iso)).not.toContain("Sep 19");
    expect(formatShowtimeFull(iso)).not.toContain("4:00 AM");
    expect(formatShowtimeFull(iso)).toBe("Fri, Sep 18, 10:30 PM");
  });
});

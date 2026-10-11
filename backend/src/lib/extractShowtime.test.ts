import { afterAll, describe, expect, it } from "vitest";
import { extractShowtime } from "./parseListingText";

// Ticket screenshots show a day and month but no year: the OCR auto-fill
// picks the nearest upcoming date, judged by the calendar in India (where
// the shows are), not by the server's or UTC's. Run with the process in a
// non-IST zone - Node re-reads TZ on assignment - to prove it doesn't matter.
describe("extractShowtime picks the nearest upcoming year", () => {
  const originalTz = process.env.TZ;
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  // 11 Oct 2026, 12:00 UTC = 11 Oct, 5:30 PM IST.
  const MID_DAY = Date.UTC(2026, 9, 11, 12, 0);
  // 11 Oct 2026, 19:00 UTC = 12 Oct, 00:30 IST.
  const AFTER_IST_MIDNIGHT = Date.UTC(2026, 9, 11, 19, 0);
  // 31 Dec 2026, 20:00 UTC = 1 Jan 2027, 1:30 AM IST.
  const IST_NEW_YEAR = Date.UTC(2026, 11, 31, 20, 0);

  for (const zone of ["America/Los_Angeles", "Pacific/Kiritimati", "UTC"]) {
    it(`with the server in ${zone}`, () => {
      process.env.TZ = zone;
      expect(new Date(MID_DAY).getTimezoneOffset()).toBe(
        { "America/Los_Angeles": 420, "Pacific/Kiritimati": -840, UTC: 0 }[zone],
      );

      // Later this year, today, and earlier today (stays today - the form
      // then says it has passed, rather than inventing next year's show).
      expect(extractShowtime("Mon, 12 Oct | 10:50 PM", MID_DAY)).toBe("2026-10-12T22:50:00.000Z");
      expect(extractShowtime("Sun, 11 Oct | 10:50 PM", MID_DAY)).toBe("2026-10-11T22:50:00.000Z");
      expect(extractShowtime("Sun, 11 Oct | 09:00 AM", MID_DAY)).toBe("2026-10-11T09:00:00.000Z");
      // Yesterday and earlier: next year.
      expect(extractShowtime("Sat, 10 Oct | 10:50 PM", MID_DAY)).toBe("2027-10-10T22:50:00.000Z");
      expect(extractShowtime("Sat, 29 Aug | 10:50 PM", MID_DAY)).toBe("2027-08-29T22:50:00.000Z");

      // Already the 12th in India while still the 11th in UTC.
      expect(extractShowtime("Sun, 11 Oct | 10:30 PM", AFTER_IST_MIDNIGHT)).toBe("2027-10-11T22:30:00.000Z");
      expect(extractShowtime("Mon, 12 Oct | 7:00 PM", AFTER_IST_MIDNIGHT)).toBe("2026-10-12T19:00:00.000Z");

      // Already 2027 in India while still 2026 in UTC.
      expect(extractShowtime("Fri, 1 Jan | 7:00 PM", IST_NEW_YEAR)).toBe("2027-01-01T19:00:00.000Z");
      expect(extractShowtime("Thu, 31 Dec | 11:00 PM", IST_NEW_YEAR)).toBe("2027-12-31T23:00:00.000Z");
    });
  }
});

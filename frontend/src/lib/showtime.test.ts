import { afterAll, describe, expect, it } from "vitest";
import { formatShowtimeFull } from "./format";
import {
  addDays,
  calendarDate,
  dateFromCalendar,
  formatShowtimeDate,
  istToday,
  latestShowtimeDate,
  partsToShowtimeIso,
  showtimeIsoToParts,
  showtimeProblem,
} from "./showtime";

// The showtime picker's conversions must give the same answers on any
// device: a seller's phone may be set to any timezone, and none of them may
// shift what they picked. Node re-reads process.env.TZ on assignment, so
// each block below really runs with that zone as the "device" timezone -
// the first assertion in each proves it. Asia/Kolkata itself is included
// as the control.
const DEVICE_ZONES = [
  ["America/Los_Angeles", 420], // UTC-07:00 in October (PDT)
  ["Pacific/Pago_Pago", 660], // UTC-11:00
  ["Pacific/Kiritimati", -840], // UTC+14:00 - a different calendar day from IST half the time
  ["Europe/London", -60], // UTC+01:00 in October (BST)
  ["UTC", 0],
  ["Asia/Kolkata", -330],
] as const;

const originalTz = process.env.TZ;
afterAll(() => {
  process.env.TZ = originalTz;
});

// 11 Oct 2026, 19:00 UTC = 12 Oct 2026, 00:30 IST: already "tomorrow" in
// India while still the 11th in UTC and every western zone.
const AFTER_IST_MIDNIGHT = Date.UTC(2026, 9, 11, 19, 0);
// 11 Oct 2026, 17:30 UTC = 11 Oct 2026, 23:00 IST.
const IST_11PM = Date.UTC(2026, 9, 11, 17, 30);

describe.each(DEVICE_ZONES)("showtime picker conversions with the device in %s", (zone, offsetMinutes) => {
  it("runs with that device timezone", () => {
    process.env.TZ = zone;
    expect(new Date(AFTER_IST_MIDNIGHT).getTimezoneOffset()).toBe(offsetMinutes);
  });

  it("stores the picked IST date and time as the same numbers, and reads them back", () => {
    process.env.TZ = zone;
    const picked = { date: "2026-09-18", hour12: 10, minute: 30, meridiem: "PM" as const };
    const iso = partsToShowtimeIso(picked);
    expect(iso).toBe("2026-09-18T22:30:00.000Z");
    expect(showtimeIsoToParts(iso!)).toEqual(picked);
    // ...and lists display exactly what was picked (format.ts).
    expect(formatShowtimeFull(iso!)).toBe("Fri, Sep 18, 10:30 PM");
    expect(formatShowtimeDate(picked.date)).toBe("Fri, 18 Sep 2026");
  });

  it("gets 12 AM / 12 PM right in both directions", () => {
    process.env.TZ = zone;
    const midnight = partsToShowtimeIso({ date: "2026-12-31", hour12: 12, minute: 0, meridiem: "AM" });
    const noon = partsToShowtimeIso({ date: "2026-12-31", hour12: 12, minute: 5, meridiem: "PM" });
    expect(midnight).toBe("2026-12-31T00:00:00.000Z");
    expect(noon).toBe("2026-12-31T12:05:00.000Z");
    expect(showtimeIsoToParts(midnight!)).toMatchObject({ date: "2026-12-31", hour12: 12, meridiem: "AM" });
    expect(showtimeIsoToParts(noon!)).toMatchObject({ hour12: 12, minute: 5, meridiem: "PM" });
  });

  it("keeps a stored minute that isn't on the 5-minute grid", () => {
    process.env.TZ = zone;
    expect(showtimeIsoToParts("2026-09-18T07:47:00.000Z")).toEqual({
      date: "2026-09-18",
      hour12: 7,
      minute: 47,
      meridiem: "AM",
    });
  });

  it("refuses impossible dates and times instead of rolling them over", () => {
    process.env.TZ = zone;
    expect(partsToShowtimeIso({ date: "2026-02-30", hour12: 7, minute: 0, meridiem: "PM" })).toBeNull();
    expect(partsToShowtimeIso({ date: "2026-02-03", hour12: 13, minute: 0, meridiem: "PM" })).toBeNull();
    expect(showtimeIsoToParts("")).toBeNull();
    expect(showtimeIsoToParts("not a date")).toBeNull();
  });

  it("takes 'today' (highlight, past dates, Today/Tomorrow) from India's calendar, not the device's", () => {
    process.env.TZ = zone;
    expect(istToday(AFTER_IST_MIDNIGHT)).toBe("2026-10-12");
    expect(addDays(istToday(AFTER_IST_MIDNIGHT), 1)).toBe("2026-10-13");
    expect(istToday(IST_11PM)).toBe("2026-10-11");
    // About 6 months ahead, across a year boundary.
    expect(latestShowtimeDate(AFTER_IST_MIDNIGHT)).toBe("2027-04-13");
  });

  it("checks 'in the future' against the time in India", () => {
    process.env.TZ = zone;
    // At 11:00 PM IST, 10:55 PM IST that day has passed and 11:05 PM hasn't -
    // whatever the device's own clock reads.
    expect(showtimeProblem("2026-10-11T22:55:00.000Z", IST_11PM)).toMatch(/already passed/);
    expect(showtimeProblem("2026-10-11T23:00:00.000Z", IST_11PM)).toMatch(/already passed/);
    expect(showtimeProblem("2026-10-11T23:05:00.000Z", IST_11PM)).toBeNull();
    // The real UTC instant is 17:30, so a naive check would accept 18:00.
    expect(showtimeProblem("2026-10-11T18:00:00.000Z", IST_11PM)).toMatch(/already passed/);
  });

  it("flags a date past the 6-month window (e.g. an auto-filled one)", () => {
    process.env.TZ = zone;
    expect(showtimeProblem("2027-04-13T21:00:00.000Z", AFTER_IST_MIDNIGHT)).toBeNull();
    expect(showtimeProblem("2027-04-14T09:00:00.000Z", AFTER_IST_MIDNIGHT)).toMatch(/6 months/);
  });

  it("hands calendar days to the date widget and back without shifting a day", () => {
    process.env.TZ = zone;
    // Every day of two years, through each zone's DST changes.
    let date = "2026-01-01";
    for (let i = 0; i < 730; i++) {
      expect(dateFromCalendar(calendarDate(date))).toBe(date);
      date = addDays(date, 1);
    }
    expect(date).toBe("2028-01-01");
  });
});

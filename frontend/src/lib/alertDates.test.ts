import { describe, expect, it } from "vitest";
import { ALERT_MAX_DATES, alertDatesProblem, alertToday } from "@grabmyseats/shared";
import { describeAlertDates, shortAlertDate, toggleAlertDate } from "./alertDates";

describe("alert dates", () => {
  it("toggles dates, kept sorted and unique", () => {
    let dates: string[] = [];
    dates = toggleAlertDate(dates, "2026-10-22");
    dates = toggleAlertDate(dates, "2026-10-20");
    expect(dates).toEqual(["2026-10-20", "2026-10-22"]);
    expect(toggleAlertDate(dates, "2026-10-20")).toEqual(["2026-10-22"]);
  });

  it(`stops at ${ALERT_MAX_DATES} dates`, () => {
    const full = Array.from({ length: ALERT_MAX_DATES }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);
    expect(toggleAlertDate(full, "2026-11-30")).toEqual(full);
  });

  it("labels dates briefly", () => {
    expect(shortAlertDate("2026-10-20")).toBe("Tue 20 Oct");
    expect(describeAlertDates([])).toBe("Any date");
    expect(describeAlertDates(["2026-10-22", "2026-10-20"])).toBe("Tue 20 Oct, Thu 22 Oct");
    expect(describeAlertDates(["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"]))
      .toBe("Tue 20 Oct, Wed 21 Oct, Thu 22 Oct and 2 more");
  });

  it("uses the same rules as the server", () => {
    const today = alertToday();
    expect(alertDatesProblem([today])).toBeNull();
    expect(alertDatesProblem([])).toBe("Pick at least one date");
    expect(alertDatesProblem(["2000-01-01"])).toBe("Dates can't be in the past");
  });
});

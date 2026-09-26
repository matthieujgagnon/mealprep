import { describe, expect, it } from "vitest";
import { addDays, formatDayLabel, formatWeekRangeLabel, mondayOf, shiftWeek, toDateKey, weeksBetween } from "./dates.js";

describe("mondayOf", () => {
  it("returns the same date when it's already a Monday", () => {
    expect(toDateKey(mondayOf(new Date(2026, 7, 31)))).toBe("2026-08-31");
  });

  it("rolls a Sunday back 6 days (not forward), the case that broke a test script once", () => {
    // getDay() === 0 for Sunday needs the -6 branch, not a naive 1 - day.
    expect(toDateKey(mondayOf(new Date(2026, 8, 6)))).toBe("2026-08-31");
  });

  it("rolls midweek dates back to their week's Monday", () => {
    expect(toDateKey(mondayOf(new Date(2026, 8, 3)))).toBe("2026-08-31"); // Thursday
  });

  it("handles a month boundary correctly", () => {
    expect(toDateKey(mondayOf(new Date(2026, 8, 1)))).toBe("2026-08-31"); // Tue Sep 1 -> Mon Aug 31
  });
});

describe("addDays / shiftWeek", () => {
  it("adds days within a month", () => {
    expect(addDays("2026-08-31", 6)).toBe("2026-09-06");
  });

  it("shiftWeek moves by whole weeks", () => {
    expect(shiftWeek("2026-08-31", 1)).toBe("2026-09-07");
    expect(shiftWeek("2026-08-31", -1)).toBe("2026-08-24");
  });

  it("crosses a year boundary", () => {
    expect(addDays("2026-12-29", 6)).toBe("2027-01-04");
  });
});

describe("formatWeekRangeLabel", () => {
  it("formats a week within one month", () => {
    expect(formatWeekRangeLabel("2026-08-31")).toBe("Aug 31 – Sep 6, 2026");
  });

  it("formats a week that stays in one month both ends", () => {
    expect(formatWeekRangeLabel("2026-09-07")).toBe("Sep 7 – 13, 2026");
  });
});

describe("formatDayLabel", () => {
  it("returns weekday/day/month for an offset within the week", () => {
    expect(formatDayLabel("2026-08-31", 0)).toMatchObject({ weekday: "Mon", dayNum: 31, monthShort: "Aug" });
    expect(formatDayLabel("2026-08-31", 6)).toMatchObject({ weekday: "Sun", dayNum: 6, monthShort: "Sep" });
  });
});

describe("weeksBetween", () => {
  it("counts whole weeks between two Mondays", () => {
    expect(weeksBetween("2026-08-31", "2026-09-14")).toBe(2);
    expect(weeksBetween("2026-09-14", "2026-08-31")).toBe(-2);
  });
});

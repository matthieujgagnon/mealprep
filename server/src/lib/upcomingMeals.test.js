import { describe, expect, it } from "vitest";
import { upcomingWhere } from "./upcomingMeals.js";

// What the filter keeps, applied by hand to a plain entry.
function keeps(where, entry) {
  return where.OR.some(
    (c) =>
      (c.weekStart.gt ? entry.weekStart > c.weekStart.gt : entry.weekStart === c.weekStart) &&
      (c.dayOfWeek ? entry.dayOfWeek >= c.dayOfWeek.gte : true)
  );
}

describe("upcomingWhere", () => {
  // Sat 2026-10-03: the week of Mon 2026-09-28, day index 5.
  const where = upcomingWhere("2026-10-03");

  it("keeps today and later days of this week", () => {
    expect(keeps(where, { weekStart: "2026-09-28", dayOfWeek: 5 })).toBe(true);
    expect(keeps(where, { weekStart: "2026-09-28", dayOfWeek: 6 })).toBe(true);
  });

  it("drops earlier days of this week and earlier weeks", () => {
    expect(keeps(where, { weekStart: "2026-09-28", dayOfWeek: 4 })).toBe(false);
    expect(keeps(where, { weekStart: "2026-09-28", dayOfWeek: 0 })).toBe(false);
    expect(keeps(where, { weekStart: "2026-09-21", dayOfWeek: 6 })).toBe(false);
  });

  it("keeps every day of every later week", () => {
    expect(keeps(where, { weekStart: "2026-10-05", dayOfWeek: 0 })).toBe(true);
    expect(keeps(where, { weekStart: "2027-03-01", dayOfWeek: 3 })).toBe(true);
  });

  it("on a Monday keeps the whole week; on a Sunday only Sunday", () => {
    const monday = upcomingWhere("2026-09-28");
    expect(keeps(monday, { weekStart: "2026-09-28", dayOfWeek: 0 })).toBe(true);
    const sunday = upcomingWhere("2026-10-04");
    expect(keeps(sunday, { weekStart: "2026-09-28", dayOfWeek: 5 })).toBe(false);
    expect(keeps(sunday, { weekStart: "2026-09-28", dayOfWeek: 6 })).toBe(true);
  });

  it("finds the right Monday across a month and a year", () => {
    // Fri 2027-01-01 belongs to the week of Mon 2026-12-28.
    const w = upcomingWhere("2027-01-01");
    expect(w.OR[1].weekStart).toBe("2026-12-28");
    expect(w.OR[1].dayOfWeek.gte).toBe(4);
  });

  it("refuses anything that isn't a real date", () => {
    expect(upcomingWhere(undefined)).toBeNull();
    expect(upcomingWhere("tomorrow")).toBeNull();
    expect(upcomingWhere("2026-02-31")).toBeNull();
  });
});

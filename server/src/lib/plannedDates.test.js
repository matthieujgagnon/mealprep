import { describe, expect, it } from "vitest";
import { mondayKey, plannedDates, validKey } from "./plannedDates.js";

describe("plannedDates", () => {
  const entries = [
    { weekStart: "2026-09-28", dayOfWeek: 0 }, // Sep 28
    { weekStart: "2026-09-28", dayOfWeek: 0 }, // a second meal the same day
    { weekStart: "2026-09-28", dayOfWeek: 6 }, // Oct 4
    { weekStart: "2026-10-05", dayOfWeek: 1 }, // Oct 6
    { weekStart: "2026-11-02", dayOfWeek: 0 }, // Nov 2
  ];

  it("lists each planned day once, sorted, inside the range", () => {
    expect(plannedDates(entries, "2026-09-28", "2026-10-31")).toEqual(["2026-09-28", "2026-10-04", "2026-10-06"]);
  });

  it("works across a month and a year", () => {
    expect(plannedDates([{ weekStart: "2026-12-28", dayOfWeek: 6 }], "2026-12-01", "2027-01-31")).toEqual(["2027-01-03"]);
  });

  it("leaves out days outside the range", () => {
    expect(plannedDates(entries, "2026-10-05", "2026-10-31")).toEqual(["2026-10-06"]);
  });
});

describe("dates", () => {
  it("knows a real date and the Monday of its week", () => {
    expect(validKey("2026-02-31")).toBeNull();
    expect(validKey("nope")).toBeNull();
    expect(mondayKey("2026-10-04")).toBe("2026-09-28"); // a Sunday
    expect(mondayKey("2026-10-05")).toBe("2026-10-05"); // a Monday
  });
});

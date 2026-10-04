import { describe, expect, it } from "vitest";
import { centerScroll, firstHiddenDay, gridRange, inWeek, monthGrid, monthOf, shiftMonth, weekOf } from "./plannerCalendar.js";

describe("the month grid", () => {
  it("starts on a Monday and ends on a Sunday, six rows", () => {
    const grid = monthGrid({ year: 2026, month: 9 }); // October 2026 starts on a Thursday
    expect(grid).toHaveLength(6);
    expect(grid.every((row) => row.length === 7)).toBe(true);
    expect(grid[0][0]).toBe("2026-09-28");
    expect(grid[0][3]).toBe("2026-10-01");
    expect(grid[5][6]).toBe("2026-11-08");
    expect(grid[4][6]).toBe("2026-11-01"); // November 1 closes the fifth row
  });

  it("shifts months across a year", () => {
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(monthOf("2026-10-06")).toEqual({ year: 2026, month: 9 });
  });

  it("gives the range to ask for", () => {
    expect(gridRange({ year: 2026, month: 9 })).toEqual({ from: "2026-09-28", to: "2026-11-08" });
  });

  it("knows the week a day is in", () => {
    expect(weekOf("2026-10-04")).toBe("2026-09-28"); // a Sunday
    expect(weekOf("2026-10-05")).toBe("2026-10-05");
    expect(inWeek("2026-10-08", "2026-10-05")).toBe(true);
    expect(inWeek("2026-10-12", "2026-10-05")).toBe(false);
  });
});

describe("the board's scrolling", () => {
  it("says which day is the first one cut off (three fit on a phone)", () => {
    expect(firstHiddenDay({ scrollLeft: 0, viewWidth: 390 })).toBe(3);
    expect(firstHiddenDay({ scrollLeft: 112, viewWidth: 390 })).toBe(4);
    expect(firstHiddenDay({ scrollLeft: 1000, viewWidth: 390 })).toBeNull();
  });

  it("centres a day, clamped to the ends", () => {
    expect(centerScroll({ day: 0, viewWidth: 390 })).toBe(0);
    expect(centerScroll({ day: 1, viewWidth: 390 })).toBe(0); // Tuesday: clamps to 0, the view in the design
    expect(centerScroll({ day: 3, viewWidth: 390 })).toBe(Math.round(14 + 3 * 112 + 52 - 195));
    expect(centerScroll({ day: 6, viewWidth: 390 })).toBe(14 * 2 + 7 * 104 + 6 * 8 - 390); // the very end
  });
});

import { describe, expect, it } from "vitest";
import { cleanWeekendDays, DEFAULT_WEEKEND_DAYS } from "./weekendDays.js";

describe("cleanWeekendDays", () => {
  it("keeps a valid list, sorted", () => {
    expect(cleanWeekendDays([6, 4])).toEqual([4, 6]);
  });
  it("drops repeats", () => {
    expect(cleanWeekendDays([5, 5, 6])).toEqual([5, 6]);
  });
  it("allows no weekend at all", () => {
    expect(cleanWeekendDays([])).toEqual([]);
  });
  it("refuses anything that is not days 0 to 6", () => {
    expect(cleanWeekendDays([7])).toBeNull();
    expect(cleanWeekendDays([-1])).toBeNull();
    expect(cleanWeekendDays([1.5])).toBeNull();
    expect(cleanWeekendDays(["5"])).toBeNull();
    expect(cleanWeekendDays("5,6")).toBeNull();
    expect(cleanWeekendDays(undefined)).toBeNull();
    expect(cleanWeekendDays([0, 1, 2, 3, 4, 5, 6, 0])).toBeNull();
  });
  it("defaults to Saturday and Sunday", () => {
    expect(DEFAULT_WEEKEND_DAYS).toEqual([5, 6]);
  });
});

import { describe, expect, it } from "vitest";
import { slotLabel, weekendDaysLabel, weekendRuns } from "./plannerSlots.js";
import { setLang } from "../i18n/index.js";

describe("weekendRuns", () => {
  it("makes one block of neighbouring days", () => {
    expect(weekendRuns([5, 6])).toEqual([{ start: 5, end: 6 }]);
    expect(weekendRuns([4, 5, 6])).toEqual([{ start: 4, end: 6 }]);
  });
  it("makes a block for each separate run, whatever order the days come in", () => {
    expect(weekendRuns([6, 4])).toEqual([{ start: 4, end: 4 }, { start: 6, end: 6 }]);
  });
  it("has none when there is no weekend", () => {
    expect(weekendRuns([])).toEqual([]);
    expect(weekendRuns(undefined)).toEqual([]);
  });
});

describe("weekendDaysLabel", () => {
  it("lists the days in the app's language", () => {
    setLang("en");
    expect(weekendDaysLabel([6, 5])).toBe("Sat Sun");
    setLang("fr");
    expect(weekendDaysLabel([5, 6])).toBe("sam dim");
    setLang("en");
  });
});

describe("slotLabel", () => {
  it("says the day and the meal", () => {
    setLang("en");
    expect(slotLabel({ dayOfWeek: 2, mealType: "breakfast" })).toBe("Wed · Breakfast");
    expect(slotLabel({ dayOfWeek: 4, mealType: "dinner" })).toBe("Fri · Supper");
  });
});

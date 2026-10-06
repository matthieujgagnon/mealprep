import { describe, expect, it } from "vitest";
import { canClearDay, entriesOnDay, slotLabel, weekendDaysLabel, weekendRuns } from "./plannerSlots.js";
import { currentWeekStart, shiftWeek } from "./dates.js";
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

describe("canClearDay (the Planner's Clear under a day)", () => {
  const week = currentWeekStart();
  const today = (new Date().getDay() + 6) % 7;
  const meal = (dayOfWeek, id) => ({ id, dayOfWeek, mealType: "dinner", recipe: { isPlaceholder: false } });
  const note = (dayOfWeek, id) => ({ id, dayOfWeek, mealType: "lunch", recipe: { isPlaceholder: true, title: "Eating out" } });

  it("gathers everything planned on the day: meals, notes and empty cards", () => {
    const entries = [meal(2, "a"), note(2, "b"), meal(3, "c")];
    expect(entriesOnDay(entries, 2).map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("shows on a day with something planned, today included", () => {
    expect(canClearDay([meal(today, "a")], week, today)).toBe(true);
    expect(canClearDay([note(6, "n")], week, 6)).toBe(true);
  });

  it("hides on a day with nothing planned", () => {
    expect(canClearDay([meal(6, "a")], week, 5)).toBe(false);
    expect(canClearDay([], week, today)).toBe(false);
  });

  it("hides on days before today, and shows on every day of next week", () => {
    if (today > 0) expect(canClearDay([meal(0, "a")], week, 0)).toBe(false);
    expect(canClearDay([meal(0, "a")], shiftWeek(week, -1), 0)).toBe(false);
    expect(canClearDay([meal(0, "a")], shiftWeek(week, 1), 0)).toBe(true);
  });
});

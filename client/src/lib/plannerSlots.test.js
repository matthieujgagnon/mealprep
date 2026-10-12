import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PHONE_PAGE_STARTS, canClearDay, entriesOnDay, pageOfDay, pickerSlot, slotLabel, weekendDaysLabel, weekendRuns } from "./plannerSlots.js";
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
  // A fixed clock: Wednesday Oct 14, 2026 at 11:30 p.m., so "today" is the same on
  // every run (the Planner's days are the device's own) and no check is skipped.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 14, 23, 30));
  });
  afterEach(() => vi.useRealTimers());
  const today = 2; // Wednesday
  let week;
  beforeEach(() => {
    week = currentWeekStart();
  });
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
    expect(canClearDay([meal(0, "a")], week, 0)).toBe(false); // Monday is before today
    expect(canClearDay([meal(0, "a")], shiftWeek(week, -1), 0)).toBe(false);
    expect(canClearDay([meal(0, "a")], shiftWeek(week, 1), 0)).toBe(true);
  });
});

describe("the phone board's pages", () => {
  it("start at Mon, Thu and Fri, so every page has three days", () => {
    expect(PHONE_PAGE_STARTS).toEqual([0, 3, 4]);
    for (const start of PHONE_PAGE_STARTS) expect(start + 2).toBeLessThanOrEqual(6);
  });

  it("opens on the first page that has the day in it", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(pageOfDay)).toEqual([0, 0, 0, 1, 1, 1, 2]);
  });
});

describe("pickerSlot (where the slot picker starts)", () => {
  // A week that isn't this one, so every day counts and the order is dinner, lunch, breakfast.
  const weekStart = "2030-01-07";
  const planned = [
    { dayOfWeek: 0, mealType: "dinner" },
    { dayOfWeek: 0, mealType: "lunch" },
  ];

  it("is the next empty slot once the week has loaded", () => {
    expect(pickerSlot({ picked: null, entries: planned, weekStart, loaded: true })).toEqual({ dayOfWeek: 0, mealType: "breakfast" });
  });

  it("moves to the next empty slot when the week arrives after the picker opened", () => {
    // Opened before the week arrived: it doesn't know what is free, so the first upcoming slot.
    const before = pickerSlot({ picked: null, entries: [], weekStart, loaded: false });
    expect(before).toEqual({ dayOfWeek: 0, mealType: "dinner" });
    // The week arrives with that slot taken: the picker follows to the next empty one.
    expect(pickerSlot({ picked: null, entries: planned, weekStart, loaded: true })).toEqual({ dayOfWeek: 0, mealType: "breakfast" });
  });

  it("never replaces a slot the person chose, or the target it opened with", () => {
    const chosen = { dayOfWeek: 3, mealType: "lunch" };
    expect(pickerSlot({ picked: chosen, entries: planned, weekStart, loaded: false })).toBe(chosen);
    expect(pickerSlot({ picked: chosen, entries: planned, weekStart, loaded: true })).toBe(chosen);
  });

  it("falls back to the first upcoming slot when the week is full", () => {
    const all = [];
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) for (const mealType of ["breakfast", "lunch", "dinner"]) all.push({ dayOfWeek, mealType });
    expect(pickerSlot({ picked: null, entries: all, weekStart, loaded: true })).toEqual({ dayOfWeek: 0, mealType: "dinner" });
  });
});

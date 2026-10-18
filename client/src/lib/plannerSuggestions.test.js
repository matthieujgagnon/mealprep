import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findNextEmptySlot, upcomingSlots } from "./plannerSlots.js";
import { rankRecipesForTray } from "./plannerSuggestions.js";
import { currentWeekStart, shiftWeek } from "./dates.js";
import { addDays, quebecDay } from "./quebecDay.js";

const recipe = (id, title, names, extra = {}) => ({
  id,
  title,
  ingredients: names.map((name) => ({ name })),
  ...extra,
});

// A use-by date n Quebec days from today ("2026-10-16"), the way the Inventory
// form saves one: days left are counted in Quebec calendar days.
const inDays = (n) => addDays(quebecDay(), n);

afterEach(() => vi.useRealTimers());

describe("upcomingSlots", () => {
  it("starts at today for the current week, dinner first", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 30, 12)); // a Wednesday
    const slots = upcomingSlots(currentWeekStart());
    expect(slots[0]).toEqual({ dayOfWeek: 2, mealType: "dinner" });
    expect(slots[1]).toEqual({ dayOfWeek: 2, mealType: "lunch" });
    expect(slots[2]).toEqual({ dayOfWeek: 2, mealType: "breakfast" });
    expect(slots).toHaveLength(5 * 3);
  });

  it("covers the whole week for any other week", () => {
    expect(upcomingSlots(shiftWeek(currentWeekStart(), 1))).toHaveLength(21);
  });

  it("findNextEmptySlot skips filled slots and returns null when full", () => {
    const week = shiftWeek(currentWeekStart(), 1);
    expect(findNextEmptySlot([{ dayOfWeek: 0, mealType: "dinner" }], week)).toEqual({ dayOfWeek: 0, mealType: "lunch" });
    const all = upcomingSlots(week);
    expect(findNextEmptySlot(all, week)).toBeNull();
  });
});

describe("recipe ranking", () => {
  const recipes = [
    recipe("a", "Spinach pie", ["spinach", "feta"]),
    recipe("b", "Chicken tacos", ["chicken thighs", "tortillas"]),
    recipe("c", "Omelette", ["eggs"]),
  ];
  // A fixed clock: 11:30 p.m. in Quebec on Oct 14, 2026, already Oct 15 in UTC.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T03:30:00Z"));
  });
  const kitchen = () => ({
    inventory: [
      { name: "spinach", expiresAt: inDays(2) },
      { name: "feta", expiresAt: inDays(20) },
      { name: "eggs", expiresAt: inDays(20) },
    ],
  });

  it("stops pushing expiring food an upcoming meal already uses", () => {
    // Spinach goes off in 2 days: it is pushed until a meal uses it.
    expect(rankRecipesForTray({ recipes, upcomingEntries: [], kitchen: kitchen() }).unusedExpiring.map((i) => i.name)).toEqual(["spinach"]);
    const { unusedExpiring } = rankRecipesForTray({
      recipes,
      upcomingEntries: [{ recipe: recipes[0], dayOfWeek: 3, mealType: "dinner" }],
      kitchen: kitchen(),
    });
    expect(unusedExpiring.map((i) => i.name)).not.toContain("spinach");
  });

  it("counts what is on hand with the shared matching, French names included", () => {
    const french = { inventory: [{ name: "Épinards" }, { name: "Fromage feta" }, { name: "Oeufs" }] };
    const { ranked } = rankRecipesForTray({ recipes, upcomingEntries: [], kitchen: french });
    const stats = Object.fromEntries(ranked.map((x) => [x.recipe.id, x.stats.missingCount]));
    expect(stats).toEqual({ a: 0, b: 2, c: 0 });
  });
});

import { describe, expect, it, vi, afterEach } from "vitest";
import { findNextEmptySlot, upcomingSlots } from "./plannerSlots.js";
import { planAroundMatches, rankRecipesForTray, suggestedGroups } from "./plannerSuggestions.js";
import { currentWeekStart, shiftWeek } from "./dates.js";

const recipe = (id, title, names, extra = {}) => ({
  id,
  title,
  ingredients: names.map((name) => ({ name })),
  ...extra,
});

const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString();

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

describe("tray suggestions", () => {
  const recipes = [
    recipe("a", "Spinach pie", ["spinach", "feta"]),
    recipe("b", "Chicken tacos", ["chicken thighs", "tortillas"]),
    recipe("c", "Omelette", ["eggs"]),
  ];
  const pantryInventory = [
    { name: "spinach", expiresAt: inDays(2) },
    { name: "feta", expiresAt: inDays(20) },
    { name: "eggs", expiresAt: inDays(20) },
  ];
  const haveCores = new Set(["spinach", "feta", "egg"]);

  it("groups expiring, on sale and nothing-to-buy, each recipe once", () => {
    const { ranked } = rankRecipesForTray({
      recipes,
      upcomingEntries: [],
      pantryInventory,
      haveCores,
      saleCores: new Set(["chicken thigh"]),
    });
    const groups = suggestedGroups(ranked);
    const ids = groups.flatMap((g) => g.tiles.map((t) => t.recipe.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(groups[0].id).toBe("expiring");
    expect(groups[0].tiles[0].recipe.id).toBe("a");
    expect(groups[0].tiles[0].reason).toMatch(/spinach/);
  });

  it("stops pushing expiring food an upcoming meal already uses", () => {
    const { unusedExpiringCores } = rankRecipesForTray({
      recipes,
      upcomingEntries: [{ recipe: recipes[0], dayOfWeek: 3, mealType: "dinner" }],
      pantryInventory,
      haveCores,
      saleCores: new Set(),
    });
    expect(unusedExpiringCores).not.toContain("spinach");
  });

  it("plan around ranks recipes by how many picked ingredients they use", () => {
    const { ranked } = rankRecipesForTray({ recipes, upcomingEntries: [], pantryInventory, haveCores, saleCores: new Set() });
    const matches = planAroundMatches(ranked, new Set(["spinach", "feta"]));
    expect(matches[0].recipe.id).toBe("a");
    expect(matches.every((m) => m.recipe.id !== "b")).toBe(true);
  });
});

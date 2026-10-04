import { describe, expect, it } from "vitest";
import { RECIPE_SLOTS, inMealGroup, recipeSlot, slotHint } from "./mealSlots.js";
import { isSideRecipe } from "./plannerSuggestions.js";

describe("recipe slots", () => {
  it("offers Side between the meals and snacks, and Dessert after them", () => {
    expect(RECIPE_SLOTS.map((s) => s.id)).toEqual(["breakfast", "lunch", "dinner", "side", "snack", "dessert", "prep"]);
    expect(slotHint("side")).toMatch(/side dish/);
  });

  it("reads a side from its slot, or from an older side tag", () => {
    expect(recipeSlot({ mealSlot: "side" })).toBe("side");
    expect(recipeSlot({ tags: ["Side dish"] })).toBe("side");
    expect(recipeSlot({ tags: ["sides", "quick"] })).toBe("side");
    expect(isSideRecipe({ title: "Garlic asparagus", mealSlot: "side" })).toBe(true);
    expect(isSideRecipe({ mealSlot: "dinner" })).toBe(false);
  });
});

describe("meal groups", () => {
  it("Meals is lunch and dinner: no breakfast, sides, snacks, desserts or pantry prep", () => {
    for (const slot of ["lunch", "dinner"]) expect(inMealGroup({ mealSlot: slot }, "meals")).toBe(true);
    for (const slot of ["breakfast", "side", "snack", "dessert", "prep", null]) {
      expect(inMealGroup({ mealSlot: slot }, "meals")).toBe(false);
    }
  });

  it("each of Makeable's other chips is its own slot", () => {
    expect(inMealGroup({ mealSlot: "breakfast" }, "breakfast")).toBe(true);
    expect(inMealGroup({ mealSlot: "dessert" }, "desserts")).toBe(true);
    expect(inMealGroup({ mealSlot: "snack" }, "snacks")).toBe(true);
    expect(inMealGroup({ mealSlot: "side" }, "sides")).toBe(true);
    expect(inMealGroup({ mealSlot: "dinner" }, "sides")).toBe(false);
  });

  it("reads an older meal tag when there's no slot", () => {
    expect(inMealGroup({ tags: ["Dinner"] }, "meals")).toBe(true);
    expect(inMealGroup({ tags: ["Desserts"] }, "desserts")).toBe(true);
  });
});

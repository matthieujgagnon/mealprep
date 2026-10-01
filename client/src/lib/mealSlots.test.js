import { describe, expect, it } from "vitest";
import { RECIPE_SLOTS, recipeSlot, slotHint } from "./mealSlots.js";
import { isSideRecipe } from "./plannerSuggestions.js";

describe("recipe slots", () => {
  it("offers Side between the meals and snacks", () => {
    expect(RECIPE_SLOTS.map((s) => s.id)).toEqual(["breakfast", "lunch", "dinner", "side", "snack", "prep"]);
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

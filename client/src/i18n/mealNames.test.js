// The three meals are Breakfast, Lunch, Supper (« Déjeuner », « Dîner »,
// « Souper »). Only the words change: the stored ids stay breakfast, lunch
// and dinner, so no data has to move.
import { describe, expect, it } from "vitest";
import { en } from "./en.js";
import { fr } from "./fr.js";

describe("meal names", () => {
  it("say Supper in English and Souper in French, wherever the meals are named", () => {
    for (const dict of [en, fr]) {
      expect(dict.meals).toHaveProperty("dinner");
      expect(dict.recipeSlots).toHaveProperty("dinner");
      expect(dict.recipes.mealTypes).toHaveProperty("dinner");
    }
    expect([en.meals.dinner, en.recipeSlots.dinner, en.recipes.mealTypes.dinner]).toEqual(["Supper", "Supper", "Supper"]);
    expect([fr.meals.dinner, fr.recipeSlots.dinner, fr.recipes.mealTypes.dinner]).toEqual(["Souper", "Souper", "Souper"]);
    expect([fr.meals.breakfast, fr.meals.lunch]).toEqual(["Déjeuner", "Dîner"]);
    expect([en.meals.breakfast, en.meals.lunch]).toEqual(["Breakfast", "Lunch"]);
  });

  it("leave no English 'dinner' in any text the app shows", () => {
    const found = [];
    (function walk(node, path) {
      if (typeof node === "string") {
        if (/dinner/i.test(node)) found.push(`${path}: ${node.slice(0, 60)}`);
      } else if (node && typeof node === "object") {
        for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
      }
    })(en, "en");
    expect(found).toEqual([]);
  });
});

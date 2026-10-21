import { describe, expect, it } from "vitest";
import { RECIPE_SLOTS, hasSlot, inMealGroup, isMakeableMeal, isMealRecipe, makeableRuleOn, recipeSlot, recipeSlotCaption, recipeSlots, slotHint } from "./mealSlots.js";
import { setLang } from "../i18n/index.js";

describe("recipe slots", () => {
  it("offers Side between the meals and snacks, and Dessert after them", () => {
    expect(RECIPE_SLOTS.map((s) => s.id)).toEqual(["breakfast", "lunch", "dinner", "side", "snack", "dessert", "prep"]);
    expect(slotHint("side")).toMatch(/side dish/);
  });

  it("reads a side from its slot, or from an older side tag", () => {
    expect(recipeSlot({ mealSlot: "side" })).toBe("side");
    expect(recipeSlot({ tags: ["Side dish"] })).toBe("side");
    expect(recipeSlot({ tags: ["sides", "quick"] })).toBe("side");
  });
});

describe("several meal types per recipe", () => {
  const chowMein = { mealSlots: ["dinner", "lunch"], mealSlot: "lunch" };

  it("is the list, in the usual order; the old single type and an old tag are read when there is no list", () => {
    expect(recipeSlots(chowMein)).toEqual(["lunch", "dinner"]);
    expect(recipeSlots({ mealSlots: ["dessert", "snack", "nonsense"] })).toEqual(["snack", "dessert"]);
    expect(recipeSlots({ mealSlot: "breakfast" })).toEqual(["breakfast"]);
    expect(recipeSlots({ mealSlots: [], mealSlot: "dinner" })).toEqual(["dinner"]);
    expect(recipeSlots({ tags: ["Dessert"] })).toEqual(["dessert"]);
    expect(recipeSlots({})).toEqual([]);
    expect(recipeSlots(null)).toEqual([]);
  });

  it("the first type is where a card needs one", () => {
    expect(recipeSlot(chowMein)).toBe("lunch");
    expect(recipeSlot({ mealSlots: [] })).toBeNull();
  });

  it("a recipe is under each of its types, once", () => {
    expect(hasSlot(chowMein, "lunch")).toBe(true);
    expect(hasSlot(chowMein, "dinner")).toBe(true);
    expect(hasSlot(chowMein, "breakfast")).toBe(false);
    const recipes = [chowMein, { mealSlots: ["dinner"] }, { mealSlots: ["breakfast"] }];
    const count = (id) => recipes.filter((r) => hasSlot(r, id)).length;
    expect([count("lunch"), count("dinner"), count("breakfast")]).toEqual([1, 2, 1]);
    // In totals it is counted once, however many types it has.
    expect(recipes.filter((r) => recipeSlots(r).length > 0).length).toBe(3);
  });

  it("a card says the first type and +1 for each other one", () => {
    setLang("en");
    expect(recipeSlotCaption({ mealSlots: ["dinner"] })).toBe("Supper");
    expect(recipeSlotCaption(chowMein)).toBe("Lunch +1");
    expect(recipeSlotCaption({ mealSlots: ["breakfast", "lunch", "dinner"] })).toBe("Breakfast +2");
    expect(recipeSlotCaption({})).toBe("");
    setLang("fr");
    expect(recipeSlotCaption(chowMein)).toBe("Dîner +1");
    setLang("en");
  });
});

describe("meals: breakfast, lunch or supper, and not prepared", () => {
  it("is the same meaning for the Recipes Meals chip, Makeable and Home", () => {
    for (const slot of ["breakfast", "lunch", "dinner"]) {
      expect(isMealRecipe({ mealSlots: [slot] })).toBe(true);
      expect(inMealGroup({ mealSlots: [slot] }, "meals")).toBe(true);
    }
    for (const slot of ["side", "snack", "dessert", "prep"]) {
      expect(isMealRecipe({ mealSlots: [slot] })).toBe(false);
      expect(inMealGroup({ mealSlots: [slot] }, "meals")).toBe(false);
    }
    expect(inMealGroup({}, "meals")).toBe(false); // not sorted yet: in no group
  });

  it("a side that is also a supper is a meal; a prepared one never is", () => {
    expect(isMealRecipe({ mealSlots: ["side", "dinner"] })).toBe(true);
    expect(isMealRecipe({ mealSlots: ["breakfast"], isPrepared: true })).toBe(false); // croissants
    expect(inMealGroup({ mealSlots: ["breakfast"], isPrepared: true }, "meals")).toBe(false);
    expect(inMealGroup({ mealSlots: ["breakfast"], isPrepared: true }, "breakfast")).toBe(true);
  });

  it("each of the other chips is one of its types", () => {
    expect(inMealGroup({ mealSlots: ["lunch", "dessert"] }, "desserts")).toBe(true);
    expect(inMealGroup({ mealSlots: ["snack"] }, "snacks")).toBe(true);
    expect(inMealGroup({ mealSlots: ["side", "dinner"] }, "sides")).toBe(true);
    expect(inMealGroup({ mealSlots: ["dinner"] }, "sides")).toBe(false);
  });

  it("reads an older meal tag when there's no slot", () => {
    expect(inMealGroup({ tags: ["Dinner"] }, "meals")).toBe(true);
    expect(inMealGroup({ tags: ["Desserts"] }, "desserts")).toBe(true);
  });
});

describe("Makeable now rule", () => {
  it("counts meals and recipes with no type, and leaves out sides, snacks, desserts, pantry prep and prepared", () => {
    for (const slot of ["breakfast", "lunch", "dinner"]) expect(isMakeableMeal({ mealSlots: [slot] })).toBe(true);
    expect(isMakeableMeal({})).toBe(true); // not sorted yet: counts like a meal, nothing disappears
    for (const slot of ["side", "snack", "dessert", "prep"]) expect(isMakeableMeal({ mealSlots: [slot] })).toBe(false);
    expect(isMakeableMeal({ mealSlots: ["breakfast"], isPrepared: true })).toBe(false);
    expect(isMakeableMeal({ isPrepared: true })).toBe(false);
  });

  it("a recipe with a meal among its types counts", () => {
    expect(isMakeableMeal({ mealSlots: ["side", "dinner"] })).toBe(true);
    expect(isMakeableMeal({ mealSlots: ["dessert", "snack"] })).toBe(false);
  });

  it("reads an older side or dessert tag", () => {
    expect(isMakeableMeal({ tags: ["Side dish"] })).toBe(false);
    expect(isMakeableMeal({ tags: ["desserts"] })).toBe(false);
  });

  it("counts everything when the sides, desserts and prepared are included", () => {
    for (const slot of ["side", "snack", "dessert", "prep"]) expect(isMakeableMeal({ mealSlots: [slot] }, true)).toBe(true);
    expect(isMakeableMeal({ mealSlots: ["breakfast"], isPrepared: true }, true)).toBe(true);
  });

  it("does not apply when the person has narrowed to one of the left-out kinds", () => {
    expect(makeableRuleOn(false, "meals")).toBe(true);
    expect(makeableRuleOn(false, "dinner")).toBe(true);
    for (const kind of ["side", "snack", "dessert", "prep", "prepared"]) expect(makeableRuleOn(false, kind)).toBe(false);
    expect(makeableRuleOn(true)).toBe(false);
  });
});

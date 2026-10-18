import { describe, expect, it } from "vitest";
import { buildGroceryList, formatAmount, recipesLine } from "./groceryList.js";
import { coresOnGroceryList, newGroceryItemCount, staleOverrideKeys } from "./groceryDedupe.js";

const entry = (ingredients, extra = {}) => ({
  recipe: { title: "Test dish", baseServings: 4, ingredients },
  servings: 4,
  ...extra,
});

describe("formatAmount", () => {
  it("reads naturally", () => {
    expect(formatAmount([{ quantity: 4, unit: "clove" }])).toBe("4 cloves");
    expect(formatAmount([{ quantity: 1, unit: "clove" }])).toBe("1 clove");
    expect(formatAmount([{ quantity: 2, unit: "bunch" }])).toBe("2 bunches");
    expect(formatAmount([{ quantity: 1500, unit: "g" }])).toBe("1 1/2 kg");
    expect(formatAmount([{ quantity: 1250, unit: "ml" }])).toBe("1 1/4 L");
    expect(formatAmount([{ quantity: 0.25, unit: null }])).toBe("1/4");
    expect(formatAmount([{ quantity: 800, unit: "g" }])).toBe("800 g");
    expect(formatAmount([{ quantity: 2, unit: null }, { quantity: 1, unit: "cup" }])).toBe("2 + 1 cup");
    expect(formatAmount([{ quantity: null, unit: null }])).toBe("");
  });
});

describe("buildGroceryList overrides", () => {
  it("flags removed rows and carries a custom quantity, leaving recipe amounts alone", () => {
    const items = buildGroceryList(
      [entry([{ name: "garlic", quantity: 4, unit: "clove" }, { name: "lemon", quantity: 1 }])],
      [],
      [
        { key: "lemon", removed: true, quantity: null },
        { key: "garlic", removed: false, quantity: "1 head", keep: true },
      ]
    );
    const garlic = items.find((i) => i.key === "garlic");
    const lemon = items.find((i) => i.key === "lemon");
    expect(lemon.removed).toBe(true);
    expect(garlic.removed).toBe(false);
    expect(garlic.customQuantity).toBe("1 head");
    expect(garlic.keep).toBe(true);
    expect(lemon.keep).toBe(false);
    // The ingredients behind a row, as the recipes write them.
    expect(garlic.ingredientNames).toEqual(["garlic"]);
    expect(garlic.parts).toEqual([{ quantity: 4, unit: "clove" }]);
  });
});

describe("several foods on one line", () => {
  it("are a row each, with no amount, merged with the same food from other lines", () => {
    const items = buildGroceryList([
      entry([{ name: "salt and pepper, to taste", quantity: 1, unit: "tsp" }, { name: "steak", quantity: 2 }]),
      entry([{ name: "salt", quantity: 1, unit: "tsp" }]),
    ]);
    expect(items.map((i) => i.name)).toEqual(["Pepper", "Salt", "Steak"]);
    // The other recipe's 1 tsp is on the same Salt row (the "to taste" line adds no amount).
    expect(items.find((i) => i.key === "salt").parts).toContainEqual({ quantity: 1, unit: "tsp" });
    expect(items.filter((i) => i.key === "salt")).toHaveLength(1);
    expect(items.find((i) => i.key === "pepper").parts).toEqual([{ quantity: null, unit: null }]);
    expect(items.find((i) => i.key === "pepper").ingredientNames).toEqual(["pepper"]);
  });
});

describe("one list across weeks", () => {
  it("merges the same ingredient from meals in different weeks into one row with the amounts added", () => {
    const items = buildGroceryList([
      entry([{ name: "garlic", quantity: 4, unit: "clove" }], { weekStart: "2026-10-05", dayOfWeek: 1 }),
      entry([{ name: "garlic", quantity: 2, unit: "clove" }], { weekStart: "2026-10-12", dayOfWeek: 3 }),
    ]);
    const garlic = items.filter((i) => i.key === "garlic");
    expect(garlic).toHaveLength(1);
    expect(garlic[0].parts).toEqual([{ quantity: 6, unit: "clove" }]);
    expect(garlic[0].usedIn).toEqual(["Test dish"]);
  });
});

describe("staleOverrideKeys", () => {
  const plan = [entry([{ name: "garlic", quantity: 4, unit: "clove" }, { name: "lemon", quantity: 1 }])];

  it("keeps rows a planned meal still needs, and hand-added ones", () => {
    const overrides = [
      { key: "lemon", removed: true },
      { key: "garlic", quantity: "1 head" },
      { key: "extra-abc", quantity: "2 cans" },
    ];
    expect(staleOverrideKeys(plan, overrides)).toEqual([]);
  });

  it("flags rows whose meals have left the plan, so a removal doesn't outlive them", () => {
    const overrides = [
      { key: "lemon", removed: true },
      { key: "onion", removed: true },
      { key: "milk", quantity: "2 packs" },
    ];
    expect(staleOverrideKeys(plan, overrides)).toEqual(["onion", "milk"]);
    // An emptied plan clears every recipe row's override.
    expect(staleOverrideKeys([], overrides)).toEqual(["lemon", "onion", "milk"]);
  });

  it("ignores leftovers and already-have meals, which add nothing to the list", () => {
    const leftover = [entry([{ name: "lemon", quantity: 1 }], { isLeftover: true })];
    expect(staleOverrideKeys(leftover, [{ key: "lemon", removed: true }])).toEqual(["lemon"]);
  });
});

describe("recipesLine: the recipes an item is for", () => {
  it("lists one or two recipes by name", () => {
    expect(recipesLine(["Tacos"])).toEqual({ names: "Tacos", more: 0, all: "Tacos" });
    expect(recipesLine(["Tacos", "Chili"])).toMatchObject({ names: "Tacos, Chili", more: 0 });
  });

  it("with three or more, shows the first and how many more (LENTIL SALAD +2)", () => {
    expect(recipesLine(["Tacos", "Chili", "Soup"])).toMatchObject({ names: "Tacos", more: 2 });
    expect(recipesLine(["A", "B", "C", "D", "E"])).toMatchObject({ names: "A", more: 4, all: "A, B, C, D, E" });
  });

  it("shows nothing for an item you added yourself", () => {
    expect(recipesLine([])).toEqual({ names: "", more: 0, all: "" });
    expect(recipesLine(undefined)).toEqual({ names: "", more: 0, all: "" });
  });

  it("counts a recipe once, however many times the item came from it", () => {
    expect(recipesLine(["Tacos", "Tacos", "Chili"])).toMatchObject({ names: "Tacos, Chili", more: 0 });
  });
});

describe("newGroceryItemCount", () => {
  const dish = entry([{ name: "lemon", quantity: 1 }, { name: "chicken thighs", quantity: 500, unit: "g" }, { name: "salt" }]);

  const none = { inventory: [] };

  it("counts what a meal adds, leaving out what Inventory holds and what is already listed", () => {
    expect(newGroceryItemCount(dish, new Set(), none)).toBe(3);
    expect(newGroceryItemCount(dish, new Set(), { inventory: [{ name: "Salt" }] })).toBe(2);
    const onList = coresOnGroceryList([entry([{ name: "lemon", quantity: 2 }])], []);
    expect(newGroceryItemCount(dish, onList, none)).toBe(2);
  });

  it("adds nothing for leftovers, food you already have or a meal already cooked", () => {
    expect(newGroceryItemCount({ ...dish, cookedAt: "2026-10-10T18:00:00Z" }, new Set(), none)).toBe(0);
    expect(newGroceryItemCount({ ...dish, isLeftover: true }, new Set(), none)).toBe(0);
    expect(newGroceryItemCount({ ...dish, alreadyHave: true }, new Set(), none)).toBe(0);
  });
});

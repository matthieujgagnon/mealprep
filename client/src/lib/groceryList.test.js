import { describe, expect, it } from "vitest";
import { buildGroceryList, formatAmount } from "./groceryList.js";

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
      {},
      [],
      [],
      [
        { key: "lemon", removed: true, quantity: null },
        { key: "garlic", removed: false, quantity: "1 head" },
      ]
    );
    const garlic = items.find((i) => i.key === "garlic");
    const lemon = items.find((i) => i.key === "lemon");
    expect(lemon.removed).toBe(true);
    expect(garlic.removed).toBe(false);
    expect(garlic.customQuantity).toBe("1 head");
    expect(garlic.parts).toEqual([{ quantity: 4, unit: "clove" }]);
  });
});

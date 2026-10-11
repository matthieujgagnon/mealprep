import { describe, expect, it } from "vitest";
import { buildTakeOut, convertAmount, haveItemFor, isStapleIngredient, itemCovers, matchingItems } from "./inventoryMatch.js";

const future = (days) => new Date(Date.now() + days * 86400000).toISOString();

describe("itemCovers", () => {
  it.each([
    ["chicken thighs", "1.2 kg chicken thighs, diced"],
    ["Poulet", "chicken thighs"],
    ["Hauts de cuisse de poulet", "boneless skinless chicken thighs"],
    ["Lait 2%", "milk"],
    ["milk", "whole milk"],
    ["ail", "garlic cloves"],
    ["oignon", "yellow onion"],
    ["oignons jaunes", "onion"],
    ["pommes de terre", "potatoes"],
    ["Beurre non salé", "butter"],
    ["riz basmati", "basmati rice"],
    ["rice", "basmati rice"],
    ["pitas", "pita bread"],
    ["Yogourt grec", "greek yogurt"],
    ["yogurt", "plain greek yogurt"],
    ["fromage cheddar", "shredded cheddar cheese"],
    ["Bouillon de poulet", "chicken broth"],
    ["Poivrons rouges", "red bell pepper"],
    ["Crème 35%", "heavy cream"],
    ["Œufs", "large eggs"],
    ["oignons verts", "scallions"],
    ["Huile d'olive", "extra-virgin olive oil"],
  ])("%s covers %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(true);
  });

  it.each([
    ["poitrines de poulet", "chicken thighs"],
    ["Bouillon de poulet", "chicken thighs"],
    ["chicken stock", "chicken breasts"],
    ["garlic powder", "garlic"],
    ["red onion", "yellow onion"],
    ["onion", "green onions"],
    ["potatoes", "sweet potatoes"],
    ["cream", "sour cream"],
    ["jasmine rice", "basmati rice"],
    ["bread", "pita bread"],
    ["black pepper", "red bell pepper"],
    ["lemons", "lemon juice"],
    ["milk", "buttermilk"],
  ])("%s does not cover %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(false);
  });
});

describe("matchingItems", () => {
  it("never matches leftovers, and uses the soonest use-by first", () => {
    const items = [
      { id: "late", name: "chicken thighs", expiresAt: future(5) },
      { id: "left", name: "Sheet-pan chicken shawarma (leftovers)", isLeftover: true, expiresAt: future(1) },
      { id: "soon", name: "Poulet", expiresAt: future(1) },
      { id: "past", name: "chicken", expiresAt: future(-2) },
    ];
    expect(matchingItems("chicken thighs", items).map((i) => i.id)).toEqual(["soon", "late", "past"]);
    expect(haveItemFor("chicken thighs", items).id).toBe("soon");
    expect(haveItemFor("chicken thighs", [items[1], items[3]])).toBe(null);
  });
});

describe("isStapleIngredient", () => {
  it("knows the app's staples, the ones you marked, and the ones you took off", () => {
    expect(isStapleIngredient("kosher salt")).toBe(true);
    expect(isStapleIngredient("extra-virgin olive oil")).toBe(true);
    expect(isStapleIngredient("chicken thighs")).toBe(false);
    expect(isStapleIngredient("basmati rice", ["riz basmati"])).toBe(true);
    expect(isStapleIngredient("sugar", [], ["sugar"])).toBe(false);
  });
});

describe("convertAmount", () => {
  it("converts weights and volumes, counts as counts, and nothing else", () => {
    expect(convertAmount(900, "g", "kg")).toBeCloseTo(0.9);
    expect(convertAmount(2, "lb", "g")).toBeCloseTo(907.18, 1);
    expect(convertAmount(3, "tbsp", "ml")).toBeCloseTo(44.36, 1);
    expect(convertAmount(2, "", "unit")).toBe(2);
    expect(convertAmount(1, "dozen", "")).toBe(12);
    expect(convertAmount(6, "", "dozen")).toBe(0.5);
    expect(convertAmount(2, "clove", "head")).toBe(null);
    expect(convertAmount(1, "cup", "g")).toBe(null);
    expect(convertAmount(null, "g", "g")).toBe(null);
  });
});

describe("buildTakeOut", () => {
  const recipe = {
    baseServings: 4,
    ingredients: [
      { name: "chicken thighs", quantity: 900, unit: "g" },
      { name: "garlic", quantity: 4, unit: "clove" },
      { name: "pita bread", quantity: 4, unit: "" },
      { name: "olive oil", quantity: 2, unit: "tbsp" },
      { name: "kosher salt", quantity: 1, unit: "tsp" },
      { name: "sumac", quantity: 1, unit: "tsp" },
      { name: "chicken thighs", quantity: 100, unit: "g", notes: "for the sauce" },
    ],
  };
  const inventory = [
    { id: "chk", name: "Hauts de cuisse de poulet", quantity: 1.2, unit: "kg", location: "fridge", expiresAt: future(2) },
    { id: "ail", name: "Ail", quantity: 1, unit: "head", location: "pantry" },
    { id: "pita", name: "pitas", quantity: 6, unit: "unit", location: "pantry" },
    { id: "oil", name: "Huile d'olive", quantity: 500, unit: "ml", location: "pantry" },
  ];

  it("scales to the servings cooked, converts units, and asks when it can't", () => {
    const rows = buildTakeOut({ recipe, servings: 4, inventory });
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(rows.map((r) => r.key)).toEqual(["item:chk", "item:ail", "item:pita", "item:oil", "staple:salt", "missing:sumac"]);
    // 900 g + 100 g of the same item, in its own unit.
    expect(by["item:chk"]).toMatchObject({ amount: 1, after: 0.2, on: true, ask: false, before: 1.2 });
    expect(by["item:chk"].names).toEqual(["chicken thighs"]);
    // Cloves are not heads: the row asks and starts off.
    expect(by["item:ail"]).toMatchObject({ ask: true, amount: null, on: false });
    expect(by["item:pita"]).toMatchObject({ amount: 4, after: 2, on: true });
    // A staple in Inventory is listed but starts off.
    expect(by["item:oil"]).toMatchObject({ staple: true, on: false, amount: 30 });
    expect(by["staple:salt"]).toMatchObject({ kind: "staple", on: false });
    expect(by["missing:sumac"]).toMatchObject({ kind: "missing", on: false, names: ["sumac"] });

    const half = buildTakeOut({ recipe, servings: 2, inventory });
    expect(half.find((r) => r.key === "item:chk")).toMatchObject({ amount: 0.5, after: 0.7 });
  });

  it("takes the rest from the next item when the first runs out", () => {
    const two = [
      { id: "a", name: "chicken thighs", quantity: 400, unit: "g", expiresAt: future(1) },
      { id: "b", name: "Poulet", quantity: 2, unit: "lb", expiresAt: future(3) },
    ];
    const rows = buildTakeOut({ recipe: { baseServings: 4, ingredients: [{ name: "chicken thighs", quantity: 900, unit: "g" }] }, servings: 4, inventory: two });
    expect(rows.map((r) => [r.key, r.amount, r.after])).toEqual([
      ["item:a", 400, 0],
      ["item:b", 1.1, 0.9],
    ]);
  });

  it("asks when the recipe gives no amount or the item has none", () => {
    const rows = buildTakeOut({
      recipe: { baseServings: 2, ingredients: [{ name: "cilantro" }, { name: "lime", quantity: 1 }] },
      servings: 2,
      inventory: [
        { id: "c", name: "coriandre", quantity: 1, unit: "bunch" },
        { id: "l", name: "lime" },
      ],
    });
    expect(rows.map((r) => [r.key, r.ask, r.on])).toEqual([
      ["item:c", true, false],
      ["item:l", true, false],
    ]);
  });
});

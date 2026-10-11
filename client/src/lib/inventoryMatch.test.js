import { describe, expect, it } from "vitest";
import {
  buildTakeOut,
  convertAmount,
  expiringItemsIn,
  foodKey,
  haveItemFor,
  ingredientHave,
  isStapleIngredient,
  itemCovers,
  matchingItems,
  recipeHave,
  recipeUsesItem,
} from "./inventoryMatch.js";

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
    ["Poivrons", "red bell pepper"],
    ["bell peppers", "red bell pepper"],
    ["Sel", "kosher salt"],
    ["Poivre noir", "black pepper"],
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
    ["Poivrons", "black pepper"],
    ["bell pepper", "pepper"],
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

describe("French pantry staples", () => {
  it.each([
    "sel", "sel casher", "gros sel", "poivre", "poivre noir", "poivre noir moulu", "huile végétale", "huile d'olive extra vierge",
    "farine tout usage", "sucre", "cassonade", "sucre brun", "poudre à pâte", "bicarbonate de soude", "fécule de maïs",
    "extrait de vanille", "vinaigre", "sauce soja", "origan", "origan séché", "thym", "romarin", "cannelle", "muscade",
    "curcuma", "cumin moulu", "paprika fumé", "feuilles de laurier", "poudre de chili",
  ])("« %s » is an always-have, like its English name", (name) => {
    expect(isStapleIngredient(name)).toBe(true);
  });

  it("reads salt and pepper written on one line, in both languages", () => {
    expect(isStapleIngredient("sel et poivre")).toBe(true);
    expect(isStapleIngredient("Sel et poivre, au goût")).toBe(true);
    expect(isStapleIngredient("salt and pepper")).toBe(true);
    expect(isStapleIngredient("salt & pepper, to taste")).toBe(true);
    // Not when one of them is food, or a staple you took off the list.
    expect(isStapleIngredient("salt and lime")).toBe(false);
    expect(isStapleIngredient("sel et poivre", [], ["salt"])).toBe(false);
  });

  it("keeps food as food: bell peppers, fresh coriander, butter and garlic are not staples", () => {
    for (const name of ["Poivrons", "poivron rouge", "bell pepper", "Coriandre fraîche", "beurre", "ail", "miel", "pâtes"]) {
      expect(isStapleIngredient(name)).toBe(false);
    }
  });
});

describe("a recipe next to your Inventory", () => {
  const recipe = {
    id: "garlic-chicken",
    ingredients: [
      { name: "boneless skinless chicken thighs" },
      { name: "garlic cloves" },
      { name: "kosher salt" },
      { name: "yellow onion" },
      { name: "minced garlic" },
      { name: "basmati rice" },
      { name: "olive oil" },
      { name: "salt and pepper" },
      { name: "fresh cilantro" },
      { name: "lime" },
    ],
  };
  const kitchen = (names, extra = {}) => ({ inventory: names.map((name) => (typeof name === "string" ? { name } : name)), customStaples: [], excludedStaples: [], ...extra });
  const english = kitchen(["Chicken thighs", "Garlic", "Onion", "Rice", "Cilantro"]);
  const french = kitchen(["Hauts de cuisse de poulet", "Ail", "Oignons", "Riz", "Coriandre"]);

  it.each([
    ["English", english],
    ["French", french],
  ])("one line per food, staples left out, the same with an %s Inventory", (_, k) => {
    const have = recipeHave(recipe, k);
    expect(have.have.map((i) => i.name)).toEqual(["Boneless skinless chicken thighs", "Garlic cloves", "Yellow onion", "Basmati rice", "Fresh cilantro"]);
    expect(have.buy.map((i) => i.name)).toEqual(["Lime"]);
    expect(have).toMatchObject({ totalCount: 6, matchedCount: 5, missingCount: 1, missing: ["Lime"] });
  });

  it("gives each ingredient its ✓: staple, have or need", () => {
    expect(ingredientHave("kosher salt", french)).toBe("staple");
    expect(ingredientHave("sel", french)).toBe("staple");
    expect(ingredientHave("garlic cloves", french)).toBe("have");
    expect(ingredientHave("lime", french)).toBe("need");
  });

  it("never counts leftovers, food past its date, or a different cut", () => {
    const k = kitchen([
      { name: "Chicken curry (leftovers)", isLeftover: true },
      { name: "Garlic", expiresAt: future(-1) },
      "Chicken breasts",
    ]);
    const have = recipeHave(recipe, k);
    expect(have.have).toEqual([]);
    expect(have.missing).toContain("Boneless skinless chicken thighs");
    expect(have.missing).toContain("Garlic cloves");
  });

  it("a line with one ingredient missing is missing, named after that ingredient", () => {
    const twoCuts = { ingredients: [{ name: "chicken" }, { name: "chicken thighs" }] };
    expect(recipeHave(twoCuts, kitchen(["Chicken breasts"])).missing).toEqual(["Chicken thighs"]);
    expect(recipeHave(twoCuts, kitchen(["Chicken thighs"])).missingCount).toBe(0);
  });

  it("leaves your own staples out, and counts a staple you took off the list", () => {
    expect(recipeHave(recipe, kitchen([], { customStaples: ["lime"] })).missing).not.toContain("Lime");
    const sugar = { ingredients: [{ name: "sugar" }, { name: "butter" }] };
    expect(recipeHave(sugar, kitchen([])).totalCount).toBe(1);
    expect(recipeHave(sugar, kitchen([], { excludedStaples: ["sugar"] })).missing).toEqual(["Sugar", "Butter"]);
  });

  it("follows Inventory as it changes", () => {
    const k = kitchen(["Ail"]);
    expect(ingredientHave("lime", k)).toBe("need");
    const next = { ...k, inventory: [...k.inventory, { name: "Limes" }] };
    expect(ingredientHave("lime", next)).toBe("have");
  });
});

describe("Cook with and uses expiring", () => {
  it("a picked item finds the recipes that use it; a staple also by its name in the recipe's", () => {
    expect(recipeUsesItem({ ingredients: [{ name: "chicken thighs" }] }, "Poulet")).toBe(true);
    expect(recipeUsesItem({ ingredients: [{ name: "chicken thighs" }] }, "Chicken breasts")).toBe(false);
    expect(recipeUsesItem({ ingredients: [{ name: "smoked paprika" }] }, "Paprika")).toBe(true);
    expect(foodKey("Poulet")).toBe(foodKey("chicken"));
  });

  it("lists the expiring items a recipe uses that no other planned meal uses, French names too, never leftovers", () => {
    const soup = { id: "soup", ingredients: [{ name: "chicken thighs" }, { name: "spinach" }] };
    const pie = { id: "pie", ingredients: [{ name: "spinach" }] };
    const inventory = [
      { name: "Poulet", expiresAt: future(2) },
      { name: "Épinards", expiresAt: future(1) },
      { name: "Chicken soup (leftovers)", isLeftover: true, expiresAt: future(1) },
      { name: "Riz", expiresAt: future(30) },
    ];
    expect(expiringItemsIn(soup, inventory, [], [soup, pie]).map((i) => i.name)).toEqual(["Épinards", "Poulet"]);
    // The pie, already planned, uses the spinach: only the chicken is left to use up.
    expect(expiringItemsIn(soup, inventory, [{ recipe: pie }], [soup, pie]).map((i) => i.name)).toEqual(["Poulet"]);
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

import { afterAll, describe, expect, it, vi } from "vitest";
import {
  buildTakeOut,
  convertAmount,
  expiringItemsIn,
  foodKey,
  haveItemFor,
  foodsOnLine,
  ingredientHave,
  isTapWater,
  itemCovers,
  matchingItems,
  recipeHave,
  recipeLines,
  recipeUsesItem,
} from "./inventoryMatch.js";
import { addDays, quebecDay } from "./quebecDay.js";

// A fixed clock: 11:30 p.m. in Quebec on Oct 14, 2026, already Oct 15 in UTC.
// Days left are Quebec calendar days, so the use-by dates are Quebec days too
// ("2026-10-17"), the way the Inventory form saves them: a date made from the
// machine clock ("now + 3 days") lands on another day near midnight.
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-10-15T03:30:00Z"));
afterAll(() => vi.useRealTimers());

const future = (days) => addDays(quebecDay(), days);

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
    // A cut only matters when both names say one.
    ["Chicken Breast Fillets", "boneless skinless chicken breasts"],
    ["chicken", "chicken thighs"],
    ["lean ground beef", "ground beef"],
    ["mangoes", "mango"],
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
    // Bottled juice is not the fruit (a whole lemon is its juice: inventoryMatchRules.test.js).
    ["lemon juice", "lemons"],
    ["milk", "buttermilk"],
    ["Poivrons", "black pepper"],
    ["bell pepper", "pepper"],
    ["Chicken Breast Fillets", "chicken thighs"],
    ["pork chops", "pork tenderloin"],
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

// Salt, oil and spices are ingredients like any other: had when Inventory holds them,
// to buy when it doesn't. Each Inventory item below covers the ways recipes write it,
// in English and in French.
const COVERS = {
  Salt: ["kosher salt", "sea salt", "sel", "sel casher", "gros sel"],
  "Black pepper": ["pepper", "freshly ground black pepper", "poivre", "poivre noir moulu", "white pepper"],
  "Olive oil": ["extra-virgin olive oil", "huile d'olive extra vierge"],
  "Vegetable oil": ["canola oil", "cooking oil", "huile végétale"],
  Sugar: ["granulated sugar", "sucre"],
  "Brown sugar": ["cassonade", "sucre brun"],
  "All-purpose flour": ["flour", "all purpose flour", "farine tout usage"],
  "Baking powder": ["poudre à pâte"],
  "Baking soda": ["bicarbonate de soude"],
  "Soy sauce": ["low-sodium soy sauce", "sauce soya"],
  Vinegar: ["white vinegar", "vinaigre"],
  "Vanilla extract": ["pure vanilla extract", "extrait de vanille"],
  Cornstarch: ["corn starch", "fécule de maïs"],
  "Garlic powder": ["poudre d'ail"],
  "Onion powder": ["poudre d'oignon"],
  Paprika: ["smoked paprika", "paprika fumé"],
  Cumin: ["ground cumin", "cumin moulu"],
  Oregano: ["dried oregano", "origan séché"],
  Cinnamon: ["ground cinnamon", "cannelle moulue"],
  "Chili powder": ["poudre de chili"],
  "Red pepper flakes": ["chili flakes", "flocons de piment"],
  "Bay leaf": ["bay leaves", "feuilles de laurier"],
  "Italian seasoning": ["assaisonnement italien"],
};

describe("salt, oil and spices are ordinary ingredients", () => {
  it.each(Object.entries(COVERS))("%s in Inventory is the ingredient, and only then", (item, names) => {
    for (const name of [item, ...names]) {
      expect(itemCovers(item, name)).toBe(true);
      expect(ingredientHave(name, { inventory: [{ name: item }] })).toBe("have");
      expect(ingredientHave(name, { inventory: [] })).toBe("need");
    }
  });

  it("is not another food: butter, garlic and olive oil are not each other", () => {
    expect(ingredientHave("butter", { inventory: [{ name: "Salt" }, { name: "Olive oil" }] })).toBe("need");
    expect(ingredientHave("garlic", { inventory: [{ name: "Garlic powder" }] })).toBe("need");
    expect(ingredientHave("sesame oil", { inventory: [{ name: "Olive oil" }] })).toBe("need");
    expect(ingredientHave("olive oil", { inventory: [{ name: "Vegetable oil" }] })).toBe("need");
  });

  it("keeps pepper the spice apart from bell peppers", () => {
    const spice = { inventory: [{ name: "Black pepper" }] };
    for (const name of ["bell pepper", "red bell pepper", "red pepper", "green pepper", "poivron", "poivron rouge", "Poivrons"]) {
      expect(ingredientHave(name, spice)).toBe("need");
    }
    const vegetable = { inventory: [{ name: "Poivrons" }] };
    for (const name of ["bell pepper", "red bell pepper", "red pepper", "poivron rouge"]) {
      expect(ingredientHave(name, vegetable)).toBe("have");
    }
    for (const name of ["pepper", "black pepper", "poivre"]) expect(ingredientHave(name, vegetable)).toBe("need");
  });

  it("reads several foods written on one line, in both languages", () => {
    expect(foodsOnLine("Salt & pepper, to taste")).toEqual(["Salt", "pepper"]);
    expect(foodsOnLine("Sel et poivre, au goût")).toEqual(["Sel", "poivre"]);
    // A note after a comma, or a name with "and" in it that is one food, stays one line.
    expect(foodsOnLine("garlic, minced")).toEqual(["garlic, minced"]);
    expect(foodsOnLine("chicken thighs, bone-in, skin-on")).toEqual(["chicken thighs, bone-in, skin-on"]);

    const both = { inventory: [{ name: "Salt" }, { name: "Black pepper" }] };
    for (const name of ["salt and pepper", "Salt & pepper, to taste", "sel et poivre", "Sel et poivre, au goût"]) {
      expect(ingredientHave(name, both)).toBe("have");
      expect(ingredientHave(name, { inventory: [{ name: "Salt" }] })).toBe("need");
      expect(ingredientHave(name, { inventory: [] })).toBe("need");
    }
    // Every food on the line must be there, and a pepper that is a vegetable is not the spice.
    expect(ingredientHave("salt and lime", { inventory: [{ name: "Salt" }] })).toBe("need");
    expect(ingredientHave("salt and lime", { inventory: [{ name: "Salt" }, { name: "Limes" }] })).toBe("have");
    expect(ingredientHave("salt and bell pepper", both)).toBe("need");
  });

  it("never asks you to buy water from the tap", () => {
    for (const name of ["water", "cold water", "boiling water", "eau", "eau froide", "Eau bouillante"]) {
      expect(isTapWater(name)).toBe(true);
      expect(ingredientHave(name, { inventory: [] })).toBe("have");
    }
    // Other waters are other foods.
    for (const name of ["coconut water", "rose water", "sparkling water", "eau de coco"]) {
      expect(isTapWater(name)).toBe(false);
    }
    expect(ingredientHave("coconut water", { inventory: [] })).toBe("need");
    expect(ingredientHave("salt and water", { inventory: [{ name: "Salt" }] })).toBe("have");
    // A water line is not a line: it adds nothing to a recipe's counts.
    const soup = { ingredients: [{ name: "water" }, { name: "salt" }] };
    expect(recipeHave(soup, { inventory: [] })).toMatchObject({ totalCount: 1, missing: ["Salt"] });
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
  const kitchen = (names) => ({ inventory: names.map((name) => (typeof name === "string" ? { name } : name)) });
  const english = kitchen(["Chicken thighs", "Garlic", "Onion", "Rice", "Cilantro"]);
  const french = kitchen(["Hauts de cuisse de poulet", "Ail", "Oignons", "Riz", "Coriandre"]);

  it.each([
    ["English", english],
    ["French", french],
  ])("one line per food, salt and oil counted like any other, the same with an %s Inventory", (_, k) => {
    const have = recipeHave(recipe, k);
    expect(have.have.map((i) => i.name)).toEqual(["Boneless skinless chicken thighs", "Garlic cloves", "Yellow onion", "Basmati rice", "Fresh cilantro"]);
    expect(have.buy.map((i) => i.name)).toEqual(["Kosher salt", "Olive oil", "Salt and pepper", "Lime"]);
    expect(have).toMatchObject({ totalCount: 9, matchedCount: 5, missingCount: 4 });
  });

  it("has them all once salt, oil and pepper are in Inventory", () => {
    const stocked = kitchen([...english.inventory, "Salt", "Huile d'olive", "Poivre noir", "Limes"]);
    expect(recipeHave(recipe, stocked)).toMatchObject({ totalCount: 9, matchedCount: 9, missingCount: 0 });
    expect(recipeLines(recipe, stocked).every((line) => line.had)).toBe(true);
  });

  it("gives each ingredient its ✓: have or need", () => {
    expect(ingredientHave("kosher salt", french)).toBe("need");
    expect(ingredientHave("sel", french)).toBe("need");
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

  it("follows Inventory as it changes", () => {
    const k = kitchen(["Ail"]);
    expect(ingredientHave("lime", k)).toBe("need");
    const next = { ...k, inventory: [...k.inventory, { name: "Limes" }] };
    expect(ingredientHave("lime", next)).toBe("have");
  });
});

describe("Cook with and uses expiring", () => {
  it("a picked item finds the recipes that use it, a spice too", () => {
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

  it("counts a spice with a use-by date like any other food", () => {
    const rub = { id: "rub", ingredients: [{ name: "smoked paprika" }, { name: "salt" }] };
    const inventory = [{ name: "Paprika", expiresAt: future(2) }, { name: "Salt" }];
    expect(expiringItemsIn(rub, inventory, [], [rub]).map((i) => i.name)).toEqual(["Paprika"]);
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
    expect(rows.map((r) => r.key)).toEqual(["item:chk", "item:ail", "item:pita", "item:oil", "missing:salt", "missing:sumac"]);
    // 900 g + 100 g of the same item, in its own unit.
    expect(by["item:chk"]).toMatchObject({ amount: 1, after: 0.2, on: true, ask: false, before: 1.2 });
    expect(by["item:chk"].names).toEqual(["chicken thighs"]);
    // Cloves are not heads: the row asks and starts off.
    expect(by["item:ail"]).toMatchObject({ ask: true, amount: null, on: false });
    expect(by["item:pita"]).toMatchObject({ amount: 4, after: 2, on: true });
    // Oil is an Inventory item like the others.
    expect(by["item:oil"]).toMatchObject({ on: true, amount: 30 });
    expect(by["missing:salt"]).toMatchObject({ kind: "missing", on: false, names: ["kosher salt"] });
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

  it("salt and oil are Inventory items like the rest, and one with no amount waits for one", () => {
    const rows = buildTakeOut({
      recipe: { baseServings: 2, ingredients: [{ name: "salt and pepper, to taste" }, { name: "water", quantity: 2, unit: "cup" }, { name: "olive oil", quantity: 1, unit: "tbsp" }] },
      servings: 2,
      inventory: [{ id: "s", name: "Salt", location: "pantry" }, { id: "o", name: "Olive oil", location: "pantry" }],
    });
    // A line of two foods is a row for each; water from the tap has none.
    expect(rows.map((r) => [r.key, r.kind, r.ask, r.on])).toEqual([
      ["item:s", "item", true, false],
      ["missing:pepper", "missing", undefined, false],
      ["item:o", "item", true, false],
    ]);
  });
});

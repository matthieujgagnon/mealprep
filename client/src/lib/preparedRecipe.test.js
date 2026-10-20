import { afterAll, describe, expect, it, vi } from "vitest";
import { buildTakeOut, expiringItemsIn, haveItemFor, ingredientHave, matchingItems, recipeHave, recipeUsesItem } from "./inventoryMatch.js";
import { recipeReceipt } from "./recipeCard.js";
import { buildGroceryList } from "./groceryList.js";
import { splitAtHome } from "./groceryAtHome.js";
import { makeableNow } from "./homeWeek.js";
import { addDays, quebecDay } from "./quebecDay.js";

// A recipe that is « Plat préparé » (croissants, a frozen lasagna: nothing to cook) is had by a
// prepared meal in Inventory with the same name, through the ONE matcher, and by nothing else:
// not an ingredient, not a leftover. Its ingredients are not looked for among the ingredients,
// and a recipe that is not prepared never matches a prepared meal.

vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-10-15T15:00:00Z"));
afterAll(() => vi.useRealTimers());

const inDays = (n) => addDays(quebecDay(), n);
const recipe = (id, title, names, extra = {}) => ({ id, title, mealSlots: ["breakfast"], ingredients: names.map((name) => ({ name, quantity: 2, unit: "unit" })), ...extra });
const croissants = recipe("croissants", "Croissants", ["croissants"], { isPrepared: true });
const lasagna = recipe("lasagna", "Frozen lasagna", ["lasagna"], { isPrepared: true, mealSlots: ["dinner"] });
const bake = recipe("bake", "Croissants maison", ["croissants", "butter"]); // not prepared: the same ingredient, a real recipe

const item = (name, extra = {}) => ({ id: name, name, location: "freezer", quantity: 4, unit: "unit", ...extra });
const kitchenOf = (...items) => ({ inventory: items });

describe("a prepared recipe is had by a prepared meal of the same name", () => {
  it("counts as had when Inventory holds that prepared meal", () => {
    const k = kitchenOf(item("Croissants", { isPreparedMeal: true }));
    expect(recipeHave(croissants, k)).toMatchObject({ totalCount: 1, matchedCount: 1, missingCount: 0 });
    expect(ingredientHave("croissants", k, { prepared: true })).toBe("have");
    expect(haveItemFor("croissants", k.inventory, { prepared: true })?.name).toBe("Croissants");
  });

  it("matches by the matcher's rules: French names, plurals, word order", () => {
    const k = kitchenOf(item("Lasagne surgelée", { isPreparedMeal: true }), item("croissant", { isPreparedMeal: true }));
    expect(recipeHave(croissants, k).missingCount).toBe(0); // "croissant" is "croissants"
    expect(matchingItems("lasagna", k.inventory, { prepared: true })).toHaveLength(0); // « lasagne surgelée » is not just "lasagna"
    const plain = kitchenOf(item("Lasagna", { isPreparedMeal: true }));
    expect(recipeHave(lasagna, plain).missingCount).toBe(0);
  });

  it("is not had by an ingredient, a leftover or anything that is not a prepared meal", () => {
    const ingredient = kitchenOf(item("Croissants"));
    const leftover = kitchenOf(item("Croissants", { isLeftover: true, unit: "portion" }));
    const other = kitchenOf(item("Bagels", { isPreparedMeal: true }));
    for (const k of [ingredient, leftover, other]) {
      expect(recipeHave(croissants, k)).toMatchObject({ matchedCount: 0, missingCount: 1 });
    }
    expect(recipeHave(croissants, kitchenOf()).missingCount).toBe(1);
  });

  it("an expired prepared meal is not had", () => {
    const k = kitchenOf(item("Croissants", { isPreparedMeal: true, expiresAt: inDays(-1) }));
    expect(recipeHave(croissants, k).missingCount).toBe(1);
  });

  it("a recipe that is not prepared never matches a prepared meal (and still matches its ingredients)", () => {
    const prepared = kitchenOf(item("Croissants", { isPreparedMeal: true }), item("Butter", { location: "fridge" }));
    expect(recipeHave(bake, prepared)).toMatchObject({ matchedCount: 1, missingCount: 1 }); // butter only
    expect(ingredientHave("croissants", prepared)).toBe("need");
    const ingredients = kitchenOf(item("Croissants"), item("Butter", { location: "fridge" }));
    expect(recipeHave(bake, ingredients).missingCount).toBe(0);
  });

  it("is a prepared recipe, so it is not made of ingredients (Cook with and \"uses expiring\" skip it)", () => {
    expect(recipeUsesItem(croissants, "Croissants")).toBe(false);
    expect(recipeUsesItem(bake, "Croissants")).toBe(true);
  });

  it("every page's numbers come from the same lines: the recipe card's receipt agrees", () => {
    const k = kitchenOf(item("Croissants", { isPreparedMeal: true }));
    const receipt = recipeReceipt(croissants, k, 2);
    expect(receipt.buy).toHaveLength(0);
    expect(receipt.have.map((row) => row.item?.name)).toEqual(["Croissants"]);
    expect(recipeReceipt(croissants, kitchenOf(item("Croissants")), 2).buy.map((r) => r.name)).toEqual(["Croissants"]);
  });
});

describe("the Makeable rule and a prepared recipe", () => {
  it("has the prepared recipe ready on Home only when Sides, desserts and prepared are included", () => {
    const k = kitchenOf(item("Croissants", { isPreparedMeal: true }));
    expect(makeableNow([croissants], k, false).ready).toHaveLength(0);
    expect(makeableNow([croissants], k, true).ready.map((m) => m.recipe.id)).toEqual(["croissants"]);
  });
});

describe("the grocery list", () => {
  const entry = (r) => ({ recipe: r, servings: 4, mealType: "dinner" });

  it("still lists a prepared recipe's ingredient when Inventory does not hold the prepared meal", () => {
    const rows = buildGroceryList([entry(croissants)], [], []);
    expect(rows.map((r) => r.name)).toEqual(["Croissant"]); // the list shows the food once, singular
    expect(rows[0].fromPrepared).toBe(true);
    const { toBuy, atHome } = splitAtHome(rows, kitchenOf(item("Croissants")), {}); // an ingredient of that name is not it
    expect(toBuy).toHaveLength(1);
    expect(atHome).toHaveLength(0);
  });

  it("puts it under Already at home when Inventory holds the prepared meal", () => {
    const rows = buildGroceryList([entry(croissants)], [], []);
    const { toBuy, atHome } = splitAtHome(rows, kitchenOf(item("Croissants", { isPreparedMeal: true })), {});
    expect(toBuy).toHaveLength(0);
    expect(atHome.map((x) => x.by.name)).toEqual(["Croissants"]);
  });

  it("a row a real recipe needs too is an ingredient row: a prepared meal does not cover it", () => {
    const rows = buildGroceryList([entry(croissants), entry(bake)], [], []);
    const row = rows.find((r) => /croissant/i.test(r.name));
    expect(row.fromPrepared).toBe(false);
    expect(splitAtHome([row], kitchenOf(item("Croissants", { isPreparedMeal: true })), {}).toBuy).toHaveLength(1);
    expect(splitAtHome([row], kitchenOf(item("Croissants")), {}).atHome).toHaveLength(1);
  });
});

describe("eating it", () => {
  it("the take-out list takes the prepared meal, never an ingredient or a leftover of that name", () => {
    const meal = item("Croissants", { isPreparedMeal: true, id: "meal" });
    const ingredient = item("Croissants", { id: "ingredient" });
    const leftover = item("Croissants", { id: "leftover", isLeftover: true, unit: "portion" });
    const rows = buildTakeOut({ recipe: croissants, servings: croissants.baseServings, inventory: [ingredient, leftover, meal] });
    expect(rows.map((r) => r.item?.id)).toEqual(["meal"]);
    expect(rows[0]).toMatchObject({ kind: "item", amount: 2, after: 2 });
    // Nothing in Inventory that is it: the row says so.
    expect(buildTakeOut({ recipe: croissants, inventory: [ingredient, leftover] }).map((r) => r.kind)).toEqual(["missing"]);
  });

  it("\"use soon\" is about the prepared meal that goes off, not about ingredients", () => {
    const meal = item("Croissants", { isPreparedMeal: true, expiresAt: inDays(2) });
    const soon = expiringItemsIn(croissants, [meal, item("Croissants", { expiresAt: inDays(1) })], [], [croissants], 3);
    expect(soon.map((i) => i.expiresAt)).toEqual([inDays(2)]);
    // A real recipe never counts a prepared meal as an ingredient that goes off.
    expect(expiringItemsIn(bake, [meal], [], [bake], 3)).toHaveLength(0);
  });
});

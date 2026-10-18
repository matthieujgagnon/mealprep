import { describe, expect, it } from "vitest";
import { buildGroceryList } from "./groceryList.js";
import { splitAtHome } from "./groceryAtHome.js";
import { newGroceryItemCount } from "./groceryDedupe.js";

const meal = (title, ...names) => ({
  id: title,
  dayOfWeek: 0,
  mealType: "dinner",
  recipe: { id: title, title, baseServings: 2, ingredients: names.map((name) => (typeof name === "string" ? { name, quantity: 1, unit: "" } : name)) },
});
const kitchen = (...names) => ({ inventory: names.map((name, i) => ({ id: `i${i}`, name, location: "pantry" })) });
const rows = (entries, extra = [], overrides = []) => buildGroceryList(entries, extra, overrides);
const names = (list) => list.map((i) => i.name);

describe("splitAtHome", () => {
  const plan = [meal("Pasta", "spaghetti", "olive oil", "salt and pepper, to taste", "water"), meal("Salad", "lime", "Olive oil")];

  it("leaves what Inventory does not hold on the list, and tells the rest apart", () => {
    const { toBuy, atHome } = splitAtHome(rows(plan), kitchen("Huile d'olive", "Salt", "Black pepper"));
    expect(names(toBuy)).toEqual(["Lime", "Spaghetti"]);
    // "salt and pepper, to taste" is a row for each food.
    expect(names(atHome.map((r) => r.item))).toEqual(["Olive oil", "Pepper", "Salt"]);
    // The Inventory item that covers a row, as the blue ✓ shows it.
    expect(atHome.map((r) => r.by.name)).toEqual(["Huile d'olive", "Black pepper", "Salt"]);
  });

  it("is the same Inventory answer as the recipe card: nothing at home when Inventory is empty", () => {
    const { toBuy, atHome } = splitAtHome(rows(plan), kitchen());
    expect(atHome).toEqual([]);
    expect(names(toBuy)).toEqual(["Lime", "Olive oil", "Pepper", "Salt", "Spaghetti"]);
  });

  it("never lists water from the tap, at home or to buy", () => {
    const all = [...splitAtHome(rows(plan), kitchen()).toBuy, ...splitAtHome(rows(plan), kitchen()).atHome.map((r) => r.item)];
    expect(names(all)).not.toContain("Water");
  });

  it("keeps a row you typed in, a row you put back, and a row with a check on it", () => {
    const extra = [{ id: "e1", name: "olive oil", quantity: 1, unit: null }];
    const list = rows(plan, extra, [{ key: "pepper", keep: true }]);
    const { toBuy, atHome } = splitAtHome(list, kitchen("Olive oil", "Salt", "Pepper"), { salt: { covered: "all" } });
    expect(names(atHome.map((r) => r.item))).toEqual(["Olive oil"]);
    expect(toBuy.map((i) => i.key)).toEqual(expect.arrayContaining(["extra-e1", "pepper", "salt"]));
  });

  it("puts salt at home and pepper on the list when only salt is in Inventory", () => {
    const { toBuy, atHome } = splitAtHome(rows([meal("Steak", "steak", "salt and pepper")]), kitchen("Sel"));
    expect(names(atHome.map((r) => r.item))).toEqual(["Salt"]);
    expect(names(toBuy)).toEqual(["Pepper", "Steak"]);
  });

  it("is at home only when every recipe line behind the row is in Inventory", () => {
    const row = (...ingredientNames) => ({ key: "x", name: "X", ingredientNames, parts: [], usedIn: [] });
    expect(splitAtHome([row("chicken thighs", "Poulet")], kitchen("Chicken thighs")).atHome).toHaveLength(1);
    expect(splitAtHome([row("chicken thighs", "chicken breasts")], kitchen("Chicken thighs")).atHome).toEqual([]);
    expect(splitAtHome([row("chicken breasts")], kitchen("Chicken thighs")).atHome).toEqual([]);
    // A row with no recipe behind it is never at home.
    expect(splitAtHome([row()], kitchen("Chicken thighs")).atHome).toEqual([]);
  });

  it("does not count food past its date or a leftover", () => {
    const old = { inventory: [{ id: "x", name: "Lime", location: "fridge", expiresAt: "2020-01-01" }, { id: "y", name: "Pasta (leftovers)", isLeftover: true }] };
    expect(splitAtHome(rows([meal("Salad", "lime")]), old).atHome).toEqual([]);
  });
});

describe("newGroceryItemCount follows Inventory", () => {
  it("counts only what is not already at home or on the list", () => {
    const dish = meal("Pasta", "spaghetti", "olive oil", "salt").recipe;
    expect(newGroceryItemCount({ recipe: dish }, new Set(), kitchen())).toBe(3);
    expect(newGroceryItemCount({ recipe: dish }, new Set(), kitchen("Olive oil", "Salt"))).toBe(1);
    expect(newGroceryItemCount({ recipe: dish }, new Set(["spaghetti"]), kitchen("Olive oil", "Salt"))).toBe(0);
  });
});

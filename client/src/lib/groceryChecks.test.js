import { describe, expect, it } from "vitest";
import { buildGroceryList } from "./groceryList.js";
import { amountLabel, applyChecks, boughtSnapshot, checkSnapshot, snapshotOf, tidyChecks } from "./groceryChecks.js";

const meal = (title, ingredients) => ({ recipe: { title, baseServings: 4, ingredients }, servings: 4 });
const chicken = (grams, title = "Roast") => meal(title, [{ name: "chicken", quantity: grams, unit: "g" }]);
const listFor = (...entries) => buildGroceryList(entries);
const one = (items, key) => items.find((i) => i.key === key);

// What the list does when you check `key`, then press "Done shopping".
function check(items, rows, key) {
  const item = one(applyChecks(items, rows).items, key);
  return { ...rows, [key]: { covered: checkSnapshot(item), bought: rows[key]?.bought ?? null, inInventory: false } };
}
function doneShopping(items, rows) {
  const { items: shown, checked } = applyChecks(items, rows);
  const next = { ...rows };
  for (const item of shown.filter((i) => checked[i.key])) next[item.key] = { covered: null, bought: boughtSnapshot(item), inInventory: false };
  return next;
}

describe("a check covers the amount it was made for", () => {
  it("shows a checked row as checked while the need is the same", () => {
    const items = listFor(chicken(500));
    const rows = check(items, {}, "chicken");
    const result = applyChecks(items, rows);
    expect(result.checked).toEqual({ chicken: true });
    expect(amountLabel(result.items[0])).toBe("500 g");
  });

  it("shows only the extra, unchecked, when a meal added later needs more", () => {
    const rows = check(listFor(chicken(500)), {}, "chicken");
    const grown = applyChecks(listFor(chicken(500), chicken(200, "Soup")), rows);
    expect(grown.checked).toEqual({});
    expect(grown.items).toHaveLength(1);
    expect(amountLabel(grown.items[0])).toBe("+200 g");
  });

  it("checking the grown row covers the new total again", () => {
    const grown = listFor(chicken(500), chicken(200, "Soup"));
    const rows = check(grown, check(listFor(chicken(500)), {}, "chicken"), "chicken");
    const result = applyChecks(grown, rows);
    expect(result.checked).toEqual({ chicken: true });
    expect(amountLabel(result.items[0])).toBe("700 g");
  });

  it("adds amounts in different units of the same kind", () => {
    const rows = check(listFor(meal("A", [{ name: "flour", quantity: 1, unit: "kg" }])), {}, "flour");
    const grown = applyChecks(listFor(meal("A", [{ name: "flour", quantity: 1, unit: "kg" }]), meal("B", [{ name: "flour", quantity: 250, unit: "g" }])), rows);
    expect(amountLabel(grown.items[0])).toBe("+1/4 kg");
  });

  it("stays checked when the need shrinks", () => {
    const rows = check(listFor(chicken(500), chicken(200, "Soup")), {}, "chicken");
    expect(applyChecks(listFor(chicken(500)), rows).checked).toEqual({ chicken: true });
  });

  it("a recipe that wasn't there needs buying for even when no amount is written", () => {
    const basil = (title) => meal(title, [{ name: "fresh basil" }]);
    const rows = check(listFor(basil("Pasta")), {}, "basil");
    expect(applyChecks(listFor(basil("Pasta")), rows).checked).toEqual({ basil: true });
    const grown = applyChecks(listFor(basil("Pasta"), basil("Pizza")), rows);
    expect(grown.checked).toEqual({});
    expect(grown.items).toHaveLength(1);
    expect(amountLabel(grown.items[0])).toBe("");
  });

  it("keeps a check made before amounts were saved covering the whole row", () => {
    const rows = { chicken: { covered: null, bought: null, inInventory: false } };
    expect(applyChecks(listFor(chicken(500), chicken(200, "Soup")), rows).checked).toEqual({ chicken: true });
  });
});

describe("Done shopping", () => {
  it("takes the bought amounts off the list", () => {
    const items = listFor(chicken(500), meal("Salad", [{ name: "lettuce", quantity: 1 }]));
    const rows = doneShopping(items, check(items, {}, "chicken"));
    const result = applyChecks(items, rows);
    expect(result.items.map((i) => i.key)).toEqual(["lettuce"]);
    expect(result.bought.map((i) => i.key)).toEqual(["chicken"]);
    expect(result.checked).toEqual({});
  });

  it("shows a later meal's need for the same ingredient as the extra only, unchecked", () => {
    const rows = doneShopping(listFor(chicken(500)), check(listFor(chicken(500)), {}, "chicken"));
    const result = applyChecks(listFor(chicken(500), chicken(300, "Soup")), rows);
    expect(result.checked).toEqual({});
    expect(amountLabel(result.items[0])).toBe("+300 g");
  });

  it("only buys the extra the next time", () => {
    const first = listFor(chicken(500));
    const later = listFor(chicken(500), chicken(300, "Soup"));
    let rows = doneShopping(first, check(first, {}, "chicken"));
    rows = check(later, rows, "chicken");
    const result = applyChecks(later, rows);
    expect(result.checked).toEqual({ chicken: true });
    expect(amountLabel(result.items[0])).toBe("300 g");
    rows = doneShopping(later, rows);
    expect(applyChecks(later, rows).items).toEqual([]);
  });

  it("treats a row marked 'in Inventory' before amounts were saved as bought", () => {
    const rows = { chicken: { covered: null, bought: null, inInventory: true } };
    expect(applyChecks(listFor(chicken(500)), rows).items).toEqual([]);
  });
});

describe("tidyChecks", () => {
  it("drops rows no planned meal needs, so a later meal starts fresh", () => {
    const rows = doneShopping(listFor(chicken(500)), check(listFor(chicken(500)), {}, "chicken"));
    expect(tidyChecks(listFor(), rows)).toEqual({ set: [], remove: ["chicken"] });
    expect(tidyChecks(listFor(chicken(500)), rows)).toEqual({ set: [], remove: [] });
  });

  it("cuts an amount back when the meals that needed it leave, so it can't cover a later meal", () => {
    const rows = doneShopping(listFor(chicken(500), chicken(300, "Soup")), check(listFor(chicken(500), chicken(300, "Soup")), {}, "chicken"));
    const after = listFor(chicken(300, "Soup"));
    const { set } = tidyChecks(after, rows);
    expect(set).toHaveLength(1);
    expect(set[0].bought.parts).toEqual([{ quantity: 300, unit: "g" }]);
    const tidied = { chicken: { covered: set[0].covered, bought: set[0].bought, inInventory: false } };
    const later = applyChecks(listFor(chicken(300, "Soup"), chicken(400, "Stew")), tidied);
    expect(amountLabel(later.items[0])).toBe("+400 g");
  });

  it("saves the amount on rows from before amounts were saved", () => {
    const items = listFor(chicken(500), meal("Salad", [{ name: "lettuce", quantity: 1 }]));
    const rows = {
      chicken: { covered: null, bought: null, inInventory: false },
      lettuce: { covered: null, bought: null, inInventory: true },
    };
    const { set, remove } = tidyChecks(items, rows);
    expect(remove).toEqual([]);
    expect(set).toEqual([
      { key: "chicken", covered: snapshotOf([{ quantity: 500, unit: "g" }], ["Roast"]), bought: null },
      { key: "lettuce", covered: null, bought: snapshotOf([{ quantity: 1, unit: null }], ["Salad"]) },
    ]);
  });

  it("is a no-op once the rows are tidy", () => {
    const items = listFor(chicken(500));
    const rows = check(items, {}, "chicken");
    expect(tidyChecks(items, rows)).toEqual({ set: [], remove: [] });
  });
});

describe("hand-added items", () => {
  it("are checked like any row, and show the extra when the amount grows", () => {
    const extra = (quantity) => buildGroceryList([], [], {}, [], [{ id: "a1", name: "paper towels", quantity, unit: null }]);
    const rows = check(extra(2), {}, "extra-a1");
    expect(applyChecks(extra(2), rows).checked).toEqual({ "extra-a1": true });
    const grown = applyChecks(extra(5), rows);
    expect(grown.checked).toEqual({});
    expect(amountLabel(grown.items[0])).toBe("+3");
  });
});

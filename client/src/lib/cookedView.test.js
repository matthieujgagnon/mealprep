import { describe, expect, it } from "vitest";
import { amountText, editedRow, plannedMealFor, shelfGroups, startingPortions, takeOutCounts, takesFrom } from "./cookedView.js";
import { leftoverItem, leftoverKeepDays, thawPatch } from "./leftovers.js";

const item = (id, location, quantity = 1, unit = "kg") => ({ id, location, quantity, unit, name: id });
const rows = [
  { key: "item:a", kind: "item", item: item("a", "fridge", 1.2), amount: 0.9, on: true, before: 1.2, after: 0.3 },
  { key: "item:b", kind: "item", item: item("b", "pantry", 6, "unit"), amount: 4, on: true, before: 6, after: 2 },
  { key: "staple:salt", kind: "staple", names: ["salt"], on: false },
  { key: "item:c", kind: "item", item: item("c", "fridge", 500, "ml"), amount: 30, on: false, staple: true, before: 500 },
  { key: "missing:sumac", kind: "missing", names: ["sumac"], on: false },
];

describe("the take-out list", () => {
  it("groups rows by shelf, then always-have, then not in Inventory", () => {
    const groups = shelfGroups(rows, (id) => id.toUpperCase());
    expect(groups.map((g) => [g.key, g.label, g.rows.map((r) => r.key)])).toEqual([
      ["shelf:fridge", "FRIDGE", ["item:a", "item:c"]],
      ["shelf:pantry", "PANTRY", ["item:b"]],
      ["staple", null, ["staple:salt"]],
      ["missing", null, ["missing:sumac"]],
    ]);
  });

  it("counts what comes out and sends each switched-on amount", () => {
    expect(takeOutCounts(rows)).toEqual({ on: 2, total: 3, stays: 1, pct: 67 });
    expect(takesFrom(rows)).toEqual([
      { id: "a", amount: 0.9 },
      { id: "b", amount: 4 },
    ]);
  });

  it("applies an edited amount, switches a row off at zero, and takes all", () => {
    expect(editedRow(rows[0], { amount: 0.5 })).toMatchObject({ amount: 0.5, after: 0.7, on: true });
    expect(editedRow(rows[0], { amount: 0 })).toMatchObject({ on: false });
    expect(editedRow(rows[0], { on: false })).toMatchObject({ on: false, after: 0.3 });
    const ask = { key: "item:d", kind: "item", item: item("d", "pantry", null, null), amount: null, ask: true, on: false, before: null };
    expect(editedRow(ask, { on: true })).toMatchObject({ on: false });
    expect(editedRow(ask, { amount: "all", on: true })).toMatchObject({ on: true, after: 0 });
  });

  it("writes amounts the way Inventory does", () => {
    expect(amountText(900, "g")).toBe("900 g");
    expect(amountText(4, "unit")).toBe("4");
    expect(amountText(1.5, "")).toBe("1 ½");
  });
});

describe("plannedMealFor", () => {
  const e = (id, weekStart, dayOfWeek, extra = {}) => ({ id, weekStart, dayOfWeek, recipe: { id: "r" }, ...extra });
  it("is today's meal, else the last one earlier this week that isn't cooked", () => {
    const entries = [e("mon", "2026-10-05", 0), e("wed", "2026-10-05", 2), e("sat", "2026-10-05", 5), e("left", "2026-10-05", 3, { isLeftover: true })];
    expect(plannedMealFor("r", entries, "2026-10-10").id).toBe("sat");
    expect(plannedMealFor("r", entries, "2026-10-09").id).toBe("wed");
    expect(plannedMealFor("r", [e("wed", "2026-10-05", 2, { cookedAt: "x" }), entries[0]], "2026-10-09").id).toBe("mon");
    expect(plannedMealFor("r", entries, "2026-10-13")).toBe(null);
    expect(plannedMealFor("other", entries, "2026-10-10")).toBe(null);
  });
});

describe("leftovers", () => {
  const recipe = { id: "r", title: "Shawarma", fridgeLifeDays: 3 };
  it("keep the recipe's fridge days, or 4, and 75 in the freezer", () => {
    expect(leftoverKeepDays(recipe, "fridge")).toBe(3);
    expect(leftoverKeepDays({}, "fridge")).toBe(4);
    expect(leftoverKeepDays(recipe, "freezer")).toBe(75);
  });

  it("are saved as the item the card shows, and thaw with the fridge time", () => {
    const now = new Date("2026-10-10T18:00:00Z");
    expect(leftoverItem(recipe, 2, "freezer", now)).toMatchObject({
      name: "Shawarma",
      quantity: 2,
      unit: "portion",
      location: "freezer",
      isLeftover: true,
      recipeId: "r",
      expiresAt: "2026-12-24T18:00:00.000Z",
    });
    expect(thawPatch(recipe, now)).toEqual({ location: "fridge", purchasedAt: now.toISOString(), expiresAt: "2026-10-13T18:00:00.000Z" });
  });

  it("start on one less than the servings cooked, or the planned leftover meals", () => {
    expect(startingPortions(4)).toBe(3);
    expect(startingPortions(4, 2)).toBe(2);
    expect(startingPortions(2, 5)).toBe(2);
    expect(startingPortions(1)).toBe(0);
  });
});

describe("one leftovers system", () => {
  const e = (id, weekStart, dayOfWeek, extra = {}) => ({ id, weekStart, dayOfWeek, recipe: { id: "r", fridgeLifeDays: 3 }, ...extra });

  it("links the leftover meals planned from today on that nothing feeds yet", async () => {
    const { linkableCopies } = await import("./leftovers.js");
    const entries = [
      e("past", "2026-10-05", 1, { isLeftover: true }),
      e("tue", "2026-10-12", 1, { isLeftover: true }),
      e("fed", "2026-10-12", 2, { isLeftover: true, leftoverItemId: "x" }),
      e("plain", "2026-10-12", 3),
      e("other", "2026-10-12", 4, { isLeftover: true, recipe: { id: "o" } }),
    ];
    expect(linkableCopies("r", entries, "2026-10-11").map((x) => x.id)).toEqual(["tue"]);
  });

  it("warns past the use-by date of the leftovers, or past the recipe's fridge days", async () => {
    const { leftoverIsStale } = await import("./leftovers.js");
    const tue = e("tue", "2026-10-12", 1, { isLeftover: true }); // Tuesday the 13th
    expect(leftoverIsStale(tue, { item: { expiresAt: "2026-10-13T20:00:00Z" } })).toBe(false);
    expect(leftoverIsStale(tue, { item: { expiresAt: "2026-10-13T00:00:00Z" } })).toBe(false);
    expect(leftoverIsStale(tue, { item: { expiresAt: "2026-10-12T20:00:00Z" } })).toBe(true);
    const fri = e("fri", "2026-10-12", 4, { isLeftover: true });
    expect(leftoverIsStale(fri, { cookedDay: 0 })).toBe(true);
    expect(leftoverIsStale(fri, { cookedDay: 1 })).toBe(false);
    expect(leftoverIsStale(fri, {})).toBe(false);
  });

  it("offers Inventory leftovers in the Planner search, soonest first, by name or recipe", async () => {
    const { plannableLeftovers } = await import("./leftovers.js");
    const items = [
      { id: "a", isLeftover: true, name: "Chili", quantity: 2, expiresAt: "2026-10-14", recipeId: "c" },
      { id: "b", isLeftover: true, name: "Pizza", quantity: 1, expiresAt: "2026-10-12" },
      { id: "c", isLeftover: true, name: "Soup", quantity: 0 },
      { id: "d", name: "Chicken", quantity: 1 },
    ];
    const recipes = [{ id: "c", title: "Texas chili" }];
    expect(plannableLeftovers(items, recipes).map((x) => x.item.id)).toEqual(["b", "a"]);
    expect(plannableLeftovers(items, recipes, "texas").map((x) => x.item.id)).toEqual(["a"]);
  });
});

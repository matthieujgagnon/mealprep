import { describe, expect, it } from "vitest";
import { planTakeOut, portionsDue, validTakes } from "./inventoryTakeOut.js";

describe("planTakeOut", () => {
  const items = [
    { id: "chk", quantity: 1.2 },
    { id: "pita", quantity: 6 },
    { id: "oil", quantity: 500 },
    { id: "lime", quantity: null },
    { id: "salt", quantity: null },
  ];

  it("lowers amounts, removes what reaches zero, and adds up takes for one item", () => {
    const plan = planTakeOut(items, [
      { id: "chk", amount: 0.9 },
      { id: "pita", amount: 4 },
      { id: "pita", amount: 2 },
      { id: "oil", amount: 30 },
      { id: "lime", amount: "all" },
      { id: "salt", amount: 1 },
      { id: "nope", amount: 1 },
    ]);
    expect(plan.updates).toEqual([
      { id: "chk", quantity: 0.3 },
      { id: "oil", quantity: 470 },
    ]);
    expect(plan.removes).toEqual(["pita", "lime"]);
  });

  it("removes an item taken past what it holds", () => {
    expect(planTakeOut([{ id: "a", quantity: 2 }], [{ id: "a", amount: 3 }])).toEqual({ updates: [], removes: ["a"] });
  });
});

describe("validTakes", () => {
  it("wants a list of ids with an amount above zero or all", () => {
    expect(validTakes([{ id: "a", amount: 2 }, { id: "b", amount: "all" }])).toBe(true);
    expect(validTakes([])).toBe(false);
    expect(validTakes([{ id: "a", amount: 0 }])).toBe(false);
    expect(validTakes([{ id: "a", amount: "2" }])).toBe(false);
    expect(validTakes([{ amount: 2 }])).toBe(false);
  });
});

describe("portionsDue", () => {
  it("counts one portion per planned leftover meal not taken off yet", () => {
    expect(
      portionsDue([
        { isLeftover: true, leftoverItemId: "a" },
        { isLeftover: true, leftoverItemId: "a" },
        { isLeftover: true, leftoverItemId: "b", cookedAt: new Date() },
        { isLeftover: true, leftoverItemId: null },
        { isLeftover: false, leftoverItemId: "c" },
      ])
    ).toEqual([{ id: "a", amount: 2 }]);
  });
});

describe("portionsDue with the Inventory items the meals are linked to", () => {
  const meal = (itemId, extra = {}) => ({ isLeftover: true, leftoverItemId: itemId, ...extra });

  it("takes one per planned meal from leftovers and from a prepared meal counted in boxes", () => {
    const items = [
      { id: "chili", isLeftover: true, unit: "portion", quantity: 3 },
      { id: "lasagna", isPreparedMeal: true, unit: "box", quantity: 2 },
      { id: "perogies", isPreparedMeal: true, unit: null, quantity: 1 },
    ];
    expect(portionsDue([meal("chili"), meal("chili"), meal("lasagna"), meal("perogies")], items)).toEqual([
      { id: "chili", amount: 2 },
      { id: "lasagna", amount: 1 },
      { id: "perogies", amount: 1 },
    ]);
  });

  it("takes a prepared meal counted by weight or volume whole", () => {
    const items = [
      { id: "a", isPreparedMeal: true, unit: "g", quantity: 900 },
      { id: "b", isPreparedMeal: true, unit: "kg", quantity: 1.5 },
      { id: "c", isPreparedMeal: true, unit: "L", quantity: 1 },
    ];
    expect(portionsDue([meal("a"), meal("a"), meal("b"), meal("c")], items)).toEqual([
      { id: "a", amount: "all" },
      { id: "b", amount: "all" },
      { id: "c", amount: "all" },
    ]);
  });

  it("never eats from an item that is not a meal, or from one that is gone", () => {
    const items = [{ id: "chicken", isLeftover: false, isPreparedMeal: false, unit: "g", quantity: 900 }];
    expect(portionsDue([meal("chicken"), meal("gone")], items)).toEqual([]);
  });

  it("still skips meals already taken off", () => {
    const items = [{ id: "lasagna", isPreparedMeal: true, unit: "box", quantity: 2 }];
    expect(portionsDue([meal("lasagna", { cookedAt: new Date() })], items)).toEqual([]);
  });

  it("a whole prepared meal comes off Inventory; one box of two leaves one", () => {
    const items = [
      { id: "a", isPreparedMeal: true, unit: "g", quantity: 900 },
      { id: "b", isPreparedMeal: true, unit: "box", quantity: 2 },
    ];
    const takes = portionsDue([meal("a"), meal("b")], items);
    expect(planTakeOut(items, takes)).toEqual({ updates: [{ id: "b", quantity: 1 }], removes: ["a"] });
  });
});

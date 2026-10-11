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

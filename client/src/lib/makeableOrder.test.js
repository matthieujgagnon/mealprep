import { describe, expect, it } from "vitest";
import { sortMakeable } from "./makeableOrder.js";

const item = (title, { missing = 0, matched = 2, atRisk = [], prep, cook, id = title } = {}) => ({
  recipe: { id, title, prepTimeMinutes: prep, cookTimeMinutes: cook },
  missingIngredients: Array.from({ length: missing }, (_, i) => `m${i}`),
  matchedCount: matched,
  atRiskUsed: atRisk,
});
const titles = (items) => items.map((i) => i.recipe.title);

describe("Makeable ordering", () => {
  const items = [
    item("Pasta", { matched: 4, prep: 10, cook: 20 }),
    item("Avocado toast", { matched: 2, atRisk: ["Avocado"], prep: 5 }),
    item("Chili", { matched: 6, missing: 1, cook: 90 }),
    item("Omelette", { matched: 3 }),
  ];

  it("Use it up first lifts recipes that finish expiring food, then fewest to buy", () => {
    expect(titles(sortMakeable(items, "useItUp"))).toEqual(["Avocado toast", "Pasta", "Omelette", "Chili"]);
  });

  it("every other sort reorders the results, avocado toast included", () => {
    expect(titles(sortMakeable(items, "fewest"))).toEqual(["Pasta", "Omelette", "Avocado toast", "Chili"]);
    expect(titles(sortMakeable(items, "quickest"))).toEqual(["Avocado toast", "Pasta", "Chili", "Omelette"]);
    expect(titles(sortMakeable(items, "az"))).toEqual(["Avocado toast", "Chili", "Omelette", "Pasta"]);
    expect(titles(sortMakeable(items, "fewest"))[0]).not.toBe("Avocado toast");
  });

  it("settles ties by title, not by the order it was given", () => {
    const tied = [item("Zucchini bake"), item("Apple crumble"), item("Mushroom soup")];
    const expected = ["Apple crumble", "Mushroom soup", "Zucchini bake"];
    expect(titles(sortMakeable(tied, "fewest"))).toEqual(expected);
    expect(titles(sortMakeable([...tied].reverse(), "fewest"))).toEqual(expected);
    expect(titles(sortMakeable(tied, "useItUp"))).toEqual(expected);
  });

  it("doesn't change the list it is given", () => {
    const copy = [...items];
    sortMakeable(items, "az");
    expect(items).toEqual(copy);
  });
});

import { describe, expect, it } from "vitest";
import { isUrlLike, matchesTime, proteinOfRecipe, sortRecipes } from "./recipesView.js";

const r = (id, title, prep, cook, extra = {}) => ({ id, title, prepTimeMinutes: prep, cookTimeMinutes: cook, createdAt: `2026-01-0${id}`, ingredients: [], ...extra });

describe("isUrlLike", () => {
  it("sees links and plain words", () => {
    expect(isUrlLike("https://site.com/recipe")).toBe(true);
    expect(isUrlLike("site.com/recipe")).toBe(true);
    expect(isUrlLike("chicken soup")).toBe(false);
  });
});

describe("matchesTime", () => {
  it("applies the ranges, and keeps recipes with no time out of every range", () => {
    const none = r(1, "None", 0, 0);
    const fifteen = r(2, "Quick", 5, 10);
    const forty = r(3, "Medium", 10, 30);
    const fiftyNine = r(4, "Almost", 29, 30);
    const hour = r(5, "Long", 30, 30);
    expect([none, fifteen, forty, fiftyNine, hour].map((x) => matchesTime(x, "any"))).toEqual([true, true, true, true, true]);
    expect([none, fifteen, forty, fiftyNine, hour].map((x) => matchesTime(x, "u20"))).toEqual([false, true, false, false, false]);
    expect([none, fifteen, forty, fiftyNine, hour].map((x) => matchesTime(x, "u45"))).toEqual([false, true, true, false, false]);
    expect([none, fifteen, forty, fiftyNine, hour].map((x) => matchesTime(x, "u60"))).toEqual([false, true, true, true, false]);
    expect([none, fifteen, forty, fiftyNine, hour].map((x) => matchesTime(x, "o60"))).toEqual([false, false, false, false, true]);
  });
});

describe("sortRecipes", () => {
  const list = [r(1, "B", 30, 0), r(2, "A", 0, 0), r(3, "C", 10, 0)];
  it("recent: newest first", () => {
    expect(sortRecipes(list, 0, new Set()).map((x) => x.id)).toEqual([3, 2, 1]);
  });
  it("quickest: shortest first, no time last", () => {
    expect(sortRecipes(list, 2, new Set()).map((x) => x.id)).toEqual([3, 1, 2]);
  });
});

describe("proteinOfRecipe", () => {
  it("names the protein a recipe uses", () => {
    const chicken = r(1, "Roast", 0, 0, { ingredients: [{ name: "chicken thighs" }] });
    expect(proteinOfRecipe(chicken)?.id).toBe("chicken");
    expect(proteinOfRecipe(r(2, "Salad", 0, 0, { ingredients: [{ name: "lettuce" }] }))).toBeNull();
  });
});

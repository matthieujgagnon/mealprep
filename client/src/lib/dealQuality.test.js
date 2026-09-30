import { describe, expect, it } from "vitest";
import { dealQuality, describeDeal, goodDealsByCore, recipeGoodDeals } from "./dealQuality.js";

const history = (unitPrice, low, high) => ({ unitPrice, sixMonthLow: low, sixMonthHigh: high, isNew: false });

describe("dealQuality", () => {
  it("rates by the deal's own 6-month range first", () => {
    expect(dealQuality(history(4.49, 4.49, 6.99))).toEqual({ level: "stock-up", reason: "6-month low" });
    expect(dealQuality(history(5.0, 4.49, 6.99))).toEqual({ level: "good", reason: "good price for 6 months" });
    expect(dealQuality(history(6.5, 4.49, 6.99))).toBe(null);
  });

  it("falls back to the Quebec average when there's no history", () => {
    expect(dealQuality({ unitPrice: 3, isNew: true, baseline: { verdict: "stock-up", pct: -30 } })).toEqual({
      level: "stock-up",
      reason: "30% under the Quebec average",
    });
    expect(dealQuality({ unitPrice: 3, isNew: true, baseline: { verdict: "normal", pct: 2 } })).toBe(null);
    expect(dealQuality({ unitPrice: 3, isNew: true })).toBe(null);
    expect(dealQuality({ unitPrice: null })).toBe(null);
  });
});

describe("planned meals and good deals", () => {
  const deals = [
    { item: "Boneless chicken breast", matchName: "chicken breast", price: "$5.49/lb", store: "IGA", unitPrice: 5.49, ...history(5.49, 4.99, 7.99) },
    { item: "Chicken breast", matchName: "chicken breast", price: "$4.49/lb", store: "Metro", ...history(4.49, 4.49, 6.99) },
    { item: "Limes", matchName: "lime", price: "4/$2.00", store: "Super C", unitPrice: 0.5, isNew: true, baseline: { verdict: "good", pct: -15 } },
    { item: "Rice", matchName: "rice", price: "$3.99", store: "Maxi", ...history(3.99, 3.49, 4.29) },
  ];
  const byCore = goodDealsByCore(deals);

  it("keeps the best good deal per ingredient", () => {
    expect([...byCore.keys()].sort()).toEqual(["chicken", "lime"]);
    expect(byCore.get("chicken").deal.store).toBe("Metro");
  });

  it("lists a recipe's ingredients at a good price, stock-up first", () => {
    const recipe = { ingredients: [{ name: "limes" }, { name: "chicken breasts" }, { name: "rice" }, { name: "lime" }] };
    const found = recipeGoodDeals(recipe, byCore);
    expect(found.map((f) => [f.name, f.quality.level])).toEqual([
      ["chicken breasts", "stock-up"],
      ["limes", "good"],
    ]);
    expect(describeDeal(found[0])).toBe("chicken breasts $4.49/lb at Metro (6-month low)");
    expect(recipeGoodDeals({ isPlaceholder: true, ingredients: [{ name: "lime" }] }, byCore)).toEqual([]);
  });
});

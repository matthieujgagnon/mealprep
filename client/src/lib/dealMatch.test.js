import { describe, expect, it } from "vitest";
import { findBestDeal, findDealsFor } from "./similarRecipes.js";

const deal = (store, item, matchName, unitPrice, unitBasis = "each", extra = {}) => ({ store, item, matchName, unitPrice, unitBasis, price: `$${unitPrice}`, ...extra });

describe("findDealsFor", () => {
  const deals = [
    deal("Super C", "Maple Leaf bacon, 375 g", "maple leaf bacon", 3.99, "each", { comparePrice: 4.83, compareBasis: "lb" }),
    deal("Metro", "Bacon, 500 g", "bacon", 5.99, "each", { comparePrice: 5.43, compareBasis: "lb" }),
    deal("Metro", "Orange juice", "orange juice", 3.49),
    deal("Maxi", "Apple juice", "apple juice", 2.49),
    deal("IGA", "Red pepper flakes", "red pepper flakes", 2.99),
    deal("IGA", "Cherry tomatoes", "cherry tomatoes", 2.99),
    deal("Metro", "Lemons", "lemons", 0.5),
  ];

  it("finds the same product, branded or not, cheapest first", () => {
    expect(findDealsFor("bacon", deals).map((d) => d.store)).toEqual(["Super C", "Metro"]);
    expect(findBestDeal("tomatoes", deals).item).toBe("Cherry tomatoes");
    expect(findBestDeal("lemon", deals).item).toBe("Lemons");
  });

  it("doesn't match an ingredient to a different product that shares a word", () => {
    expect(findBestDeal("lemon juice", deals)).toBeNull();
    expect(findBestDeal("apple cider vinegar", deals)).toBeNull();
    expect(findBestDeal("red bell pepper", deals)).toBeNull();
  });
});

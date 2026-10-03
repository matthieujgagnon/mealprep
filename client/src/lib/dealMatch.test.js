import { describe, expect, it } from "vitest";
import { coversIngredient, findBestDeal, findDealsFor, findSaleDeal } from "./similarRecipes.js";

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

describe("what the recipe card counts as on hand, and as on sale", () => {
  it("needs the same cut when both names say one", () => {
    expect(coversIngredient("Chicken Breast Fillets", "chicken thighs")).toBe(false);
    expect(coversIngredient("Chicken Breast Fillets", "boneless skinless chicken breasts")).toBe(true);
    expect(coversIngredient("chicken", "chicken thighs")).toBe(true);
    expect(coversIngredient("pork chops", "pork tenderloin")).toBe(false);
    expect(coversIngredient("lean ground beef", "ground beef")).toBe(true);
    expect(coversIngredient("mangoes", "mango")).toBe(true);
  });

  it("only tags a deal that's really on sale", () => {
    const regular = { id: 1, store: "Metro", item: "Mangoes", matchName: "mangoes", price: "$11.99", unitPrice: 11.99, unitBasis: "each" };
    const sale = { id: 2, store: "Maxi", item: "Mangoes", matchName: "mangoes", price: "$1.50", unitPrice: 1.5, unitBasis: "each", regularPrice: 2.49 };
    expect(findSaleDeal("mangoes", [regular])).toBe(null);
    expect(findSaleDeal("mangoes", [regular, sale])).toBe(sale);
  });
});

describe("French ingredient names", () => {
  const fr = (id, item) => ({ id, item, matchName: item.split("|").pop().trim().toLowerCase(), unitPrice: 1, unitBasis: "each", store: "Metro" });
  const deals = [
    fr(1, "Poitrines de poulet désossées Maple Leaf, 500 g | Boneless chicken breasts"),
    fr(2, "Lait de coco | Coconut milk"),
    fr(3, "Lait 2 % | 2% milk"),
    fr(4, "BŒUF HACHÉ MAIGRE | LEAN GROUND BEEF"),
    fr(5, "Poulet pané | Breaded chicken"),
    fr(6, "Poulet entier | Whole chicken"),
    fr(7, "Beurre d'arachide | Peanut butter"),
    fr(8, "Pois chiches en conserve | Canned chickpeas"),
  ];
  const ids = (name) => findDealsFor(name, deals).map((d) => d.id);

  it("meet the French half of a Quebec flyer's name, accents or not", () => {
    expect(ids("Poitrines de poulet")).toEqual([1]);
    expect(ids("boeuf hache")).toEqual([4]);
    expect(ids("Pois chiches")).toEqual([8]);
    expect(ids("Lait de coco")).toEqual([2]);
  });

  it("but not another product that starts with the same food", () => {
    expect(ids("Lait")).toEqual([3]); // not coconut milk
    expect(ids("Poulet")).toEqual([6]); // not breaded chicken
    expect(ids("Beurre")).toEqual([]); // not peanut butter
  });
});

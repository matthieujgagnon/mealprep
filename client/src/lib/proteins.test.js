import { describe, expect, it } from "vitest";
import { PROTEINS, mentionsTofu, proteinOf, proteinSearchQuery, proteinsOnSale, recipesUsingProtein } from "./proteins.js";

const deal = (item, aisle, extra = {}) => ({ id: item, store: "Metro", item, matchName: item.toLowerCase(), aisle, unitPrice: 2.99, unitBasis: "each", price: "$2.99", ...extra });

describe("tofu as a protein", () => {
  it("is one of the kinds Home lists", () => {
    expect(PROTEINS.map((p) => p.id)).toContain("tofu");
  });

  it("finds tofu in whatever aisle the store keeps it", () => {
    for (const aisle of ["meat", "dairy", "produce", "deli", "other", undefined]) {
      expect(proteinOf(deal("Firm tofu", aisle))?.id).toBe("tofu");
    }
    expect(proteinOf(deal("Tofu ferme", "other"))?.id).toBe("tofu");
  });

  it("still keeps non-meat out of the other kinds", () => {
    expect(proteinOf(deal("Chicken flavoured crackers", "snacks"))).toBeNull();
    expect(proteinOf(deal("Boneless chicken breast", "meat"))?.id).toBe("chicken");
  });

  it("lists a tofu on sale with the other kinds", () => {
    const kinds = proteinsOnSale([deal("Silken tofu", "other"), deal("Boneless chicken breast", "meat")]);
    expect(kinds.map((k) => k.protein.id)).toEqual(["chicken", "tofu"]);
  });

  it("recognizes every kind of tofu in a recipe's ingredients", () => {
    for (const name of ["tofu", "firm tofu", "extra-firm tofu, drained", "Silken Tofu", "tofu ferme", "14 oz block of tofu"]) {
      expect(mentionsTofu(name)).toBe(true);
    }
    for (const name of ["tofurky slices", "chicken", ""]) expect(mentionsTofu(name)).toBe(false);
  });
});

describe("recipes that use a protein", () => {
  const recipe = (title, ingredients = [], extra = {}) => ({ title, tags: [], ingredients: ingredients.map((name) => ({ name })), ...extra });
  const kind = (id) => PROTEINS.find((p) => p.id === id);

  it("counts what Recipes' search finds with the same words", async () => {
    const { matchesSearch } = await import("./recipeSearch.js");
    const recipes = [
      recipe("Curry", ["chicken thighs"]),
      recipe("Poulet rôti", ["poulet"]),
      recipe("Tofu bowl", ["firm tofu"]),
      recipe("Rice", ["rice"]),
      recipe("Note", [], { isPlaceholder: true, title: "chicken night" }),
    ];
    expect(recipesUsingProtein(recipes, kind("chicken")).map((r) => r.title)).toEqual(["Curry", "Poulet rôti"]);
    expect(recipesUsingProtein(recipes, kind("tofu"))).toHaveLength(1);
    expect(recipesUsingProtein(recipes, kind("pork"))).toHaveLength(0);
    for (const p of PROTEINS) {
      const n = recipes.filter((r) => !r.isPlaceholder && matchesSearch(r, proteinSearchQuery(p))).length;
      expect(recipesUsingProtein(recipes, p)).toHaveLength(n);
    }
  });

  it("gives tofu its own emoji", () => {
    expect(kind("tofu").emoji).not.toBe("🫘");
    expect(new Set(PROTEINS.map((p) => p.emoji)).size).toBe(PROTEINS.length);
  });
});

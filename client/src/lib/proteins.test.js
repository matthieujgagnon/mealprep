import { describe, expect, it } from "vitest";
import { PROTEINS, mentionsTofu, proteinOf, proteinRows, proteinSearchQuery, proteinsOnSale, recipesUsingProtein } from "./proteins.js";

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

  it("keeps smoked, marinated, pouched and crispy tofu: it's still tofu to cook with", () => {
    for (const name of ["Smoked tofu", "Crispy tofu bites", "Sunrise Soya Foods Tofu Pouch", "Marinated tofu, 227 g", "Tofu - ferme ou extra-ferme", "Organic tofu, extra firm"]) {
      expect(proteinOf(deal(name, "meat"))?.id).toBe("tofu");
    }
  });

  it("leaves out a made dish with tofu in it", () => {
    for (const name of ["Miso soup with tofu", "Tofu salad", "Tofu burgers", "Pork and tofu dumplings", "Tofu pad thai noodles"]) {
      expect(proteinOf(deal(name, "other"))).toBeNull();
    }
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

describe("Home's protein rows", () => {
  const ids = (rows) => rows.map((r) => r.protein.id);

  it("lists every kind even with no flyers at all, each saying nothing this week", () => {
    const rows = proteinRows([]);
    expect(ids(rows)).toEqual(PROTEINS.map((p) => p.id));
    expect(rows.every((r) => r.status === "none" && r.best === null)).toBe(true);
    expect(ids(proteinRows(undefined))).toHaveLength(PROTEINS.length);
  });

  it("puts a real deal first and keeps the kinds with nothing after it", () => {
    const rows = proteinRows([deal("Boneless chicken breast", "meat", { regularPrice: 5.99, unitPrice: 3.99, unitBasis: "lb" })]);
    expect(rows[0]).toMatchObject({ status: "deal" });
    expect(rows[0].protein.id).toBe("chicken");
    expect(rows).toHaveLength(PROTEINS.length);
    expect(rows.slice(1).every((r) => r.status === "none")).toBe(true);
  });

  it("shows this week's tofu even when nothing says if the price is good", () => {
    const rows = proteinRows([deal("Smoked tofu, 350 g", "other")]);
    const tofu = rows.find((r) => r.protein.id === "tofu");
    expect(tofu.status).toBe("unsure");
    expect(tofu.best.item).toBe("Smoked tofu, 350 g");
  });

  it("gives a tofu with a real saving the deal row", () => {
    const rows = proteinRows([deal("Firm tofu", "other", { regularPrice: 3.99, unitPrice: 2.49 })]);
    expect(rows[0].protein.id).toBe("tofu");
    expect(rows[0].status).toBe("deal");
  });

  it("lamb and veal has its own emoji, and so does every other kind", () => {
    expect(PROTEINS.find((p) => p.id === "lamb-veal").emoji).toBe("🐑");
    expect(PROTEINS.every((p) => p.emoji)).toBe(true);
  });
});

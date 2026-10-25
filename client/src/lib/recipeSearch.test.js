import { afterEach, describe, expect, it } from "vitest";
import { matchesIngredientSearch } from "./finder.js";
import { ingredientSearchTerms, setIngredientOverrides } from "./ingredientDisplay.js";
import { matchesSearch } from "./recipeSearch.js";

// The recipe search box finds either language through the table of ingredient names (the
// built-in file with Matt's changes on top), without caring about capitals, accents or hyphens.

afterEach(() => setIngredientOverrides([]));

const recipe = (title, names = [], tags = []) => ({ id: title, title, tags, ingredients: names.map((name) => ({ name })) });
const salad = recipe("Green salad", ["fresh cilantro", "lime", "olive oil"]);
const salade = recipe("Salade verte", ["coriandre fraîche", "lime"]);
const cake = recipe("Spice cake", ["ground coriander", "flour"], ["dessert"]);
const soup = recipe("Chou-fleur soup", ["chou-fleur", "épinards", "oignons rouges"]);
const found = (query, ...recipes) => recipes.filter((r) => matchesSearch(r, query)).map((r) => r.title);

describe("the recipe search", () => {
  it("« coriandre » finds a recipe with fresh cilantro, and cilantro finds « coriandre fraîche »", () => {
    expect(found("coriandre", salad, salade, cake)).toEqual(["Green salad", "Salade verte", "Spice cake"]);
    expect(found("cilantro", salad, salade)).toEqual(["Green salad", "Salade verte"]);
    expect(found("coriander", salad, salade)).toEqual(["Green salad", "Salade verte"]);
  });

  it("finds the other language's plural and singular", () => {
    expect(found("amande", recipe("A", ["almonds"]), recipe("B", ["walnuts"]))).toEqual(["A"]);
    expect(found("almonds", recipe("A", ["amandes effilées"]))).toEqual(["A"]);
    expect(found("épinard", soup)).toEqual(["Chou-fleur soup"]);
  });

  it("finds a name with describing words in the other language", () => {
    expect(found("oignon rouge", recipe("A", ["red onions"]), recipe("B", ["yellow onions"]))).toEqual(["A"]);
    expect(found("red onion", soup)).toEqual(["Chou-fleur soup"]);
  });

  it("does not care about capitals, accents, apostrophes or hyphens", () => {
    expect(found("EPINARDS", soup)).toEqual(["Chou-fleur soup"]);
    expect(found("epinards", soup)).toEqual(["Chou-fleur soup"]);
    expect(found("chou fleur", soup)).toEqual(["Chou-fleur soup"]);
    expect(found("chou-fleur", recipe("A", ["chou fleur"]))).toEqual(["A"]);
    expect(found("gousse d'ail", recipe("A", ["Gousses d’ail"]))).toEqual(["A"]);
  });

  it("still finds half a word, a title and a tag, as written", () => {
    expect(found("cori", salad, salade, cake)).toEqual(["Salade verte", "Spice cake"]);
    expect(found("salade", salad, salade)).toEqual(["Salade verte"]);
    expect(found("dessert", salad, cake)).toEqual(["Spice cake"]);
  });

  it("treats a comma as 'any of' and an empty search as everything", () => {
    expect(found("coriandre, flour", salad, cake, soup)).toEqual(["Green salad", "Spice cake"]);
    expect(found("zorblax, flour", salad, cake)).toEqual(["Spice cake"]);
    expect(found("", salad, cake)).toEqual(["Green salad", "Spice cake"]);
    expect(found(" , ", salad)).toEqual(["Green salad"]);
    expect(matchesSearch(salad, null)).toBe(true);
  });

  it("does not run a match across two fields", () => {
    expect(found("salad spice", salad, cake)).toEqual([]);
    expect(found("lime olive", salad)).toEqual([]);
  });

  it("reads a recipe again when it is replaced by an edited one", () => {
    const before = recipe("Stew", ["beef"]);
    expect(matchesSearch(before, "boeuf")).toBe(true);
    const after = { ...before, ingredients: [{ name: "lamb" }] };
    expect(matchesSearch(after, "boeuf")).toBe(false);
    expect(matchesSearch(after, "agneau")).toBe(true);
  });

  it("leaves a name that is a different ingredient in each language as it is written (« raisin »)", () => {
    expect(ingredientSearchTerms("raisins")).toEqual(["raisins"]);
    expect(found("raisins", recipe("A", ["grapes"]), recipe("B", ["raisins"]))).toEqual(["B"]);
  });

  it("follows Matt's changes at once, both ways", () => {
    const stew = recipe("Stew", ["kohlrabi"]);
    expect(matchesSearch(stew, "chou-rave")).toBe(false);
    setIngredientOverrides([{ id: "k1", replaces: null, hidden: false, enOne: "kohlrabi", enOther: "kohlrabis", frOne: "chou-rave", frOther: "choux-raves", gender: "m" }]);
    expect(matchesSearch(stew, "chou-rave")).toBe(true);
    expect(matchesSearch(recipe("Soupe", ["choux-raves"]), "kohlrabi")).toBe(true);
    setIngredientOverrides([]);
    expect(matchesSearch(stew, "chou-rave")).toBe(false);
  });
});

describe("the Cook with search", () => {
  it("finds an Inventory item in either language", () => {
    expect(matchesIngredientSearch("Bananas", "banane")).toBe(true);
    expect(matchesIngredientSearch("Épinards", "spinach")).toBe(true);
    expect(matchesIngredientSearch("Coriandre", "cilantro")).toBe(true);
    expect(matchesIngredientSearch("Milk", "banane")).toBe(false);
  });

  it("does not care about accents or capitals, finds half a word, and shows everything for a blank search", () => {
    expect(matchesIngredientSearch("Épinards", "EPIN")).toBe(true);
    expect(matchesIngredientSearch("Chou-fleur", "chou fleur")).toBe(true);
    expect(matchesIngredientSearch("Milk", "")).toBe(true);
    expect(matchesIngredientSearch("Milk", "   ")).toBe(true);
  });
});

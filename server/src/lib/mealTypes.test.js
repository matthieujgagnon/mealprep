import { describe, expect, it } from "vitest";
import { MEAL_SLOTS, readMealTypes, readPrepared, suggestForRecipe, suggestMealSlots, suggestPrepared } from "./mealTypes.js";

const ing = (...names) => names.map((name) => ({ name }));

describe("readMealTypes", () => {
  it("takes the list, in the usual order, without repeats", () => {
    expect(readMealTypes({ mealSlots: ["dinner", "lunch", "dinner"] })).toEqual({ ok: true, value: ["lunch", "dinner"] });
    expect(readMealTypes({ mealSlots: MEAL_SLOTS })).toEqual({ ok: true, value: MEAL_SLOTS });
  });
  it("still takes the one old type", () => {
    expect(readMealTypes({ mealSlot: "breakfast" })).toEqual({ ok: true, value: ["breakfast"] });
    // The list wins when both are sent.
    expect(readMealTypes({ mealSlots: ["lunch"], mealSlot: "breakfast" })).toEqual({ ok: true, value: ["lunch"] });
  });
  it("leaves the types as they are when the request does not say (or clears the old one)", () => {
    expect(readMealTypes({})).toEqual({ ok: true, value: undefined });
    expect(readMealTypes({ mealSlot: null })).toEqual({ ok: true, value: undefined });
    expect(readMealTypes({ mealSlot: "" })).toEqual({ ok: true, value: undefined });
    expect(readMealTypes()).toEqual({ ok: true, value: undefined });
  });
  it("refuses an unknown type, a list that is not a list, and an empty list", () => {
    expect(readMealTypes({ mealSlots: ["supper"] })).toEqual({ ok: false, key: "mustBeOneOf" });
    expect(readMealTypes({ mealSlots: "dinner" })).toEqual({ ok: false, key: "mustBeOneOf" });
    expect(readMealTypes({ mealSlots: [1] })).toEqual({ ok: false, key: "mustBeOneOf" });
    expect(readMealTypes({ mealSlot: "brunch" })).toEqual({ ok: false, key: "mustBeOneOf" });
    expect(readMealTypes({ mealSlots: [] })).toEqual({ ok: false, key: "mealTypeRequired" });
  });
});

describe("readPrepared", () => {
  it("is a yes or no", () => {
    expect(readPrepared(true)).toEqual({ ok: true, value: true });
    expect(readPrepared(false)).toEqual({ ok: true, value: false });
    expect(readPrepared(undefined)).toEqual({ ok: true, value: undefined });
    expect(readPrepared("yes").ok).toBe(false);
    expect(readPrepared(null).ok).toBe(false);
  });
});

describe("the suggested meal types (rules from the title and the ingredients)", () => {
  const types = (title, ...names) => suggestMealSlots({ title, ingredients: ing(...names) });

  it("knows a breakfast, in either language", () => {
    expect(types("Fluffy Pancakes", "flour", "milk")).toEqual(["breakfast"]);
    expect(types("Crêpes bretonnes", "farine", "lait")).toEqual(["breakfast"]);
    expect(types("Gruau aux bleuets", "avoine")).toEqual(["breakfast"]);
    expect(types("Chocolatine")).toEqual(["breakfast"]);
  });
  it("gives an omelette or a quiche breakfast and lunch", () => {
    expect(types("Spinach Omelette", "eggs", "spinach")).toEqual(["breakfast", "lunch"]);
    expect(types("Quiche lorraine", "eggs", "bacon")).toEqual(["breakfast", "lunch"]);
  });
  it("knows a dessert, and does not mistake a pancake for a cake", () => {
    expect(types("Chocolate Chip Cookies", "flour")).toEqual(["dessert"]);
    expect(types("Gâteau au fromage", "fromage")).toEqual(["dessert"]);
    expect(types("Apple Pie", "apples")).toEqual(["dessert"]);
    expect(types("Shepherd's Pie", "beef", "potatoes")).toEqual(["dinner"]);
  });
  it("knows a snack", () => {
    expect(types("Roasted red pepper hummus", "chickpeas")).toEqual(["snack"]);
    expect(types("Energy bites", "oats")).toEqual(["snack"]);
  });
  it("knows a pantry prep (pickles, sauces, dressings) but not a meal with a sauce", () => {
    expect(types("Pickled shallots", "shallots", "vinegar")).toEqual(["prep"]);
    expect(types("Peanut sauce", "peanut butter")).toEqual(["prep"]);
    expect(types("Vinaigrette maison", "huile")).toEqual(["prep"]);
    expect(types("Chicken with mushroom sauce", "chicken", "mushrooms")).toEqual(["dinner"]);
    expect(types("Spaghetti with meat sauce", "pasta", "beef")).toEqual(["dinner"]);
  });
  it("knows a side, unless it has a main in it", () => {
    expect(types("Garlic mashed potatoes", "potatoes")).toEqual(["side"]);
    expect(types("Roasted carrots", "carrots")).toEqual(["side"]);
    expect(types("Coleslaw", "cabbage")).toEqual(["side"]);
    expect(types("Roasted chickpea gyros", "chickpeas", "pita")).toEqual(["dinner"]);
  });
  it("gives a soup, a sandwich or a bowl lunch and supper", () => {
    expect(types("Tomato soup", "tomatoes")).toEqual(["lunch", "dinner"]);
    expect(types("Soupe aux pois", "pois")).toEqual(["lunch", "dinner"]);
    expect(types("Chicken salad sandwich", "chicken")).toEqual(["lunch", "dinner"]);
  });
  it("takes a main for a supper", () => {
    expect(types("Chow Mein", "noodles", "cabbage")).toEqual(["dinner"]);
    expect(types("Poulet au beurre", "poulet")).toEqual(["dinner"]);
    expect(types("Dinner tonight", "a", "b", "c", "d", "e")).toEqual(["dinner"]); // five ingredients is a meal
  });
  it("leaves it to the person when the rules cannot decide", () => {
    expect(types("Matt's thing", "mystery")).toEqual([]);
    expect(types("")).toEqual([]);
    expect(suggestMealSlots()).toEqual([]);
  });
});

describe("suggested « Plat préparé »", () => {
  const prepared = (title, ...names) => suggestPrepared({ title, ingredients: ing(...names) });

  it("is suggested for a one-ingredient recipe", () => {
    expect(prepared("Chocolatine", "chocolatines")).toBe(true);
    expect(prepared("Matt's snack", "crackers")).toBe(true);
  });
  it("is suggested for a bakery name, however long the list", () => {
    expect(prepared("Croissants", "croissants", "butter")).toBe(true);
    expect(prepared("Bagel with cream cheese", "bagels", "cream cheese", "lox")).toBe(true);
  });
  it("is suggested for a frozen ready meal, and for a ready-meal name with one or two ingredients", () => {
    expect(prepared("Frozen lasagna", "lasagna", "salad", "bread")).toBe(true);
    expect(prepared("Pizza surgelée", "pizza", "olives", "basil")).toBe(true);
    expect(prepared("Perogies", "perogies", "onions")).toBe(true);
  });
  it("is not suggested for a real recipe, even one named like a ready meal", () => {
    expect(prepared("Lasagna", "pasta", "beef", "cheese", "tomatoes", "onion")).toBe(false);
    expect(prepared("Chow Mein", "noodles", "cabbage", "soy sauce")).toBe(false);
    expect(prepared("Pancakes")).toBe(false); // no ingredients yet: nothing to go on
  });
  it("is one answer next to the types", () => {
    expect(suggestForRecipe({ title: "Croissants", ingredients: ing("croissants") })).toEqual({ slots: ["breakfast"], prepared: true });
  });
});

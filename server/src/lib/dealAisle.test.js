import { describe, expect, it } from "vitest";
import { aisleFor, looksLikeReadyMeal } from "./dealAisle.js";

describe("aisleFor", () => {
  it.each([
    ["Poires cactus | cactus pears", "produce"],
    ["Tomates raisins de serre, cerises ou mélangées", "produce"],
    ["PC black label salmon fillets, 400 g", "seafood"],
    ["Lean ground beef", "meat"],
    ["Ground coffee, 925 g", "pantry"],
    ["Chicken broth, 900 mL", "pantry"],
    ["Butter chicken sauce", "pantry"],
    ["Peanut butter", "pantry"],
    ["Natrel 2% milk, 4 L", "dairy"],
    ["Large eggs, 12-pack", "dairy"],
    ["Chocolatines", "bakery"],
    ["McCain superfries, frozen", "frozen"],
    ["Ice cream, 1.5 L", "frozen"],
    ["Pizza surgelée", "frozen"],
    ["Orange juice, 1.75 L", "drinks"],
    ["Watermelon", "produce"],
    ["Ruffles chips", "snacks"],
    ["Graham crackers", "snacks"],
    ["Sliced ham, deli", "deli"],
    ["Paper towels, 6 rolls", "household"],
    ["Dish soap", "household"],
    // Grocery-list ingredients that used to land in the wrong aisle.
    ["lemon juice", "pantry"],
    ["apple cider vinegar", "pantry"],
    ["red bell pepper", "produce"],
    ["black pepper", "pantry"],
    ["coconut milk", "pantry"],
    ["spaghetti", "pantry"],
    ["green onions", "produce"],
    ["fresh ginger", "produce"],
    ["bacon", "meat"],
    ["canned tomatoes", "pantry"],
    // From a live flyer audit.
    ["filets de poisson panés Blue Water | Blue Water breaded fish fillets", "seafood"],
    ["HIGH LINER FISH STICKS, FILLETS, BURGERS FISH & CHIPS OR SHRIMP", "seafood"],
    ["DRUMSTICK OU FRIANDISES GLACÉES NESTLÉ", "frozen"],
    ["Eska spring water, 24 x 500 mL", "drinks"],
    ["McCAFÉ GROUND COFFEE, 300 g", "pantry"],
  ])("%s -> %s", (item, aisle) => {
    expect(aisleFor({ item })).toBe(aisle);
  });

  it("falls back to the stored category, then Other", () => {
    expect(aisleFor({ item: "Mystery thing", category: "protein" })).toBe("meat");
    expect(aisleFor({ item: "Mystery thing", category: "other" })).toBe("other");
  });
});

// The ready-meal words are shared with the flyer rule: the flyers must sort the
// dishes exactly as they always did.
describe("the flyers still sort the ready-meal words as before", () => {
  it.each([
    ["Pizza", "deli"],
    ["Lasagna", "deli"],
    ["Lasagne à la viande", "deli"],
    ["Quiche lorraine", "deli"],
    ["Tourtière", "deli"],
    ["Ready meals", "deli"],
    ["Prêt-à-manger", "deli"],
    ["Frozen lasagna", "frozen"],
    ["Pizza surgelée", "frozen"],
    ["Pierogi", "other"],
    ["Pot pie", "bakery"],
    ["Chicken pot pie", "meat"],
    ["Pizza sauce", "pantry"],
    ["Lasagna noodles", "pantry"],
  ])("%s -> %s", (item, aisle) => {
    expect(aisleFor({ item })).toBe(aisle);
  });
});

describe("looksLikeReadyMeal", () => {
  it.each([
    "Lasagna",
    "Lasagne",
    "Lasagne à la viande",
    "Frozen lasagna",
    "Perogies",
    "Pierogi",
    "Cheddar pierogies",
    "Pyrohy",
    "Tourtière",
    "Tourtiere du Lac-Saint-Jean",
    "Pâté chinois",
    "Pate chinois",
    "Pâté",
    "Pâtés",
    "Chicken pot pie",
    "Pot pie",
    "Quiche lorraine",
    "Pizza",
    "Frozen pizza",
    "Pizza surgelée",
    "Frozen meal",
    "Frozen dinner",
    "Repas congelé",
    "Plat préparé",
    "Ready meal",
    "Shepherd's pie",
  ])("%s looks like a ready meal", (name) => {
    expect(looksLikeReadyMeal(name)).toBe(true);
  });

  it.each([
    // Foods to cook with, whose names hold a dish's word.
    "Pizza dough",
    "Pizza sauce",
    "Pizza cheese",
    "Fromage à pizza",
    "Pâte à pizza",
    "Lasagna noodles",
    "Chicken pot pie mix",
    "Pizza crust",
    "Pâte feuilletée",
    "Pâtes",
    "Pâte",
    "Pasta",
    "Pasta sauce",
    // Plain foods.
    "Chicken breast",
    "Poulet",
    "Sliced ham",
    "Hummus",
    "Rotisserie chicken",
    "Sushi",
    "Puff pastry",
    // A real prepared meal with no dish word in its name: the person tags it.
    "Chicken, Broccoli and Cheddar Puff Pastry",
    "",
    null,
    undefined,
  ])("%s does not", (name) => {
    expect(looksLikeReadyMeal(name)).toBe(false);
  });

  it("reads « pâté » at the end of a name (the accent boundary)", () => {
    expect(looksLikeReadyMeal("Pâté")).toBe(true);
    expect(looksLikeReadyMeal("Pâté de campagne")).toBe(true);
    expect(looksLikeReadyMeal("Mon pâté")).toBe(true);
  });
});

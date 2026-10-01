import { describe, expect, it } from "vitest";
import { aisleFor } from "./dealAisle.js";

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
  ])("%s -> %s", (item, aisle) => {
    expect(aisleFor({ item })).toBe(aisle);
  });

  it("falls back to the stored category, then Other", () => {
    expect(aisleFor({ item: "Mystery thing", category: "protein" })).toBe("meat");
    expect(aisleFor({ item: "Mystery thing", category: "other" })).toBe("other");
  });
});

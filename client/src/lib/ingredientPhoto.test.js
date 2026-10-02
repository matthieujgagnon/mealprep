import { describe, expect, it } from "vitest";
import { genericPhotoUrl, matchIngredient } from "./ingredientPhoto.js";

describe("generic Inventory photos (TheMealDB)", () => {
  it("picks the most specific ingredient in the name", () => {
    expect(matchIngredient("Chicken Breast Fillets")).toBe("Chicken Breast");
    expect(matchIngredient("Chicken thighs")).toBe("Chicken Thighs");
    expect(matchIngredient("Lean ground beef")).toBe("Ground Beef");
    expect(matchIngredient("Baby spinach")).toBe("Spinach");
    expect(matchIngredient("Greek yogurt")).toBe("Greek Yogurt");
    expect(matchIngredient("Red onion")).toBe("Red Onions");
    expect(matchIngredient("Frozen peas")).toBe("Frozen Peas");
    expect(matchIngredient("All-purpose flour")).toBe("All purpose flour");
    expect(matchIngredient("Smoked paprika")).toBe("Smoked Paprika");
    expect(matchIngredient("Shrimp, peeled")).toBe("Shrimp");
    expect(matchIngredient("Tomatoes")).toBe("Tomato");
    expect(matchIngredient("Eggs")).toBe("Egg");
  });

  it("takes the noun, not the describing word", () => {
    expect(matchIngredient("Butter chicken leftovers")).toBe("Chicken");
    expect(matchIngredient("Red bell pepper")).toBe("Red Pepper");
  });

  it("knows other names, French names and plain words", () => {
    expect(matchIngredient("Bbq sauce")).toBe("Barbeque Sauce");
    expect(matchIngredient("Aged cheddar")).toBe("Cheddar Cheese");
    expect(matchIngredient("Yoghurt")).toBe("Yogurt");
    expect(matchIngredient("Sourdough")).toBe("Bread");
    expect(matchIngredient("Pasta")).toBe("Penne Pasta");
    expect(matchIngredient("Poitrines de poulet")).toBe("Chicken Breast");
    expect(matchIngredient("Lait 2%")).toBe("Milk");
    expect(matchIngredient("pommes Cortland | apples")).toBe("Apples");
  });

  it("has nothing for things it doesn't know", () => {
    expect(matchIngredient("Paper towels")).toBe(null);
    expect(genericPhotoUrl("Paper towels")).toBe(null);
  });

  it("links the small picture", () => {
    expect(genericPhotoUrl("Basmati rice")).toBe("https://www.themealdb.com/images/ingredients/Basmati%20Rice-Small.png");
  });
});

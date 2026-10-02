import { describe, expect, it } from "vitest";
import { parseIngredientText } from "./scrapeRecipe.js";

describe("parseIngredientText (the editor's Paste a whole list)", () => {
  it("splits each line into qty, unit, name and note", () => {
    const rows = parseIngredientText("2 cups flour\n1 tbsp butter, melted\n3 red bell peppers");
    expect(rows.map(({ name, quantity, unit, notes }) => ({ name, quantity, unit, notes }))).toEqual([
      { name: "Flour", quantity: 2, unit: "cup", notes: null },
      { name: "Butter", quantity: 1, unit: "tbsp", notes: "melted" },
      { name: "Red bell peppers", quantity: 3, unit: null, notes: null },
    ]);
  });

  it("drops bullets and blank lines, and turns header lines into sections", () => {
    const rows = parseIngredientText("• 1 lb chicken\n\nFor the sauce:\n- 2 tbsp soy sauce\n");
    expect(rows.map((r) => [r.name, r.group])).toEqual([
      ["Chicken", null],
      ["Soy sauce", "For the sauce"],
    ]);
    expect(rows.map((r) => r.position)).toEqual([0, 1]);
  });

  it("returns nothing for empty text", () => {
    expect(parseIngredientText("  \n ")).toEqual([]);
  });
});

describe("measures the editor offers are read from a pasted list too", () => {
  const parse = (text) => parseIngredientText(text).map(({ name, quantity, unit }) => [quantity, unit, name]);

  it("reads blocks, sticks, loaves, fillets, cartons, tubs and leaves", () => {
    expect(
      parse(
        "1 block cheddar cheese\n2 sticks butter\n1 loaf sourdough\n2 fillets salmon\n1 carton eggs\n1 tub yogurt\n4 leaves basil"
      )
    ).toEqual([
      [1, "block", "Cheddar cheese"],
      [2, "stick", "Butter"],
      [1, "loaf", "Sourdough"],
      [2, "fillet", "Salmon"],
      [1, "carton", "Eggs"],
      [1, "tub", "Yogurt"],
      [4, "leaf", "Basil"],
    ]);
  });

  it("reads pieces, bottles, boxes, bags and dozens it used to miss", () => {
    expect(parse("2 pieces ginger\n1 bottle white wine\n1 box spaghetti\n1 bag spinach\n1 dozen eggs")).toEqual([
      [2, "piece", "Ginger"],
      [1, "bottle", "White wine"],
      [1, "box", "Spaghetti"],
      [1, "bag", "Spinach"],
      [1, "dozen", "Eggs"],
    ]);
  });

  it("leaves a describing word alone", () => {
    expect(parse("3 bay leaves")).toEqual([[3, null, "Bay leaves"]]);
  });
});

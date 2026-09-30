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

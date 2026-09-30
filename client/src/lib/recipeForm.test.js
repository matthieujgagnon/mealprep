import { describe, expect, it } from "vitest";
import { ingredientsToRows, instructionsToSteps, rowsToIngredients, stepsToInstructions } from "./recipeForm.js";
import { recipeSlot } from "./mealSlots.js";

const strip = (rows) => rows.map(({ _id, ...rest }) => rest);

describe("ingredient rows", () => {
  it("adds a section row before each group and round-trips back", () => {
    const ingredients = [
      { name: "Chicken", quantity: 1.5, unit: "lb", notes: null, group: null },
      { name: "Soy sauce", quantity: 0.25, unit: "cup", notes: "low sodium", group: "Sauce" },
      { name: "Garlic", quantity: 2, unit: "clove", notes: "(minced)", group: "Sauce" },
    ];
    const rows = ingredientsToRows(ingredients);
    expect(strip(rows)).toEqual([
      { name: "Chicken", quantity: "1 1/2", unit: "lb", notes: "" },
      { isSection: true, name: "Sauce" },
      { name: "Soy sauce", quantity: "1/4", unit: "cup", notes: "low sodium" },
      { name: "Garlic", quantity: "2", unit: "clove", notes: "minced" },
    ]);
    expect(rowsToIngredients(rows)).toEqual([
      { name: "Chicken", quantity: 1.5, unit: "lb", notes: null, group: null, position: 0 },
      { name: "Soy sauce", quantity: 0.25, unit: "cup", notes: "low sodium", group: "Sauce", position: 1 },
      { name: "Garlic", quantity: 2, unit: "clove", notes: "minced", group: "Sauce", position: 2 },
    ]);
  });

  it("drops rows with no name", () => {
    expect(rowsToIngredients([{ name: "  ", quantity: "2", unit: "", notes: "" }])).toEqual([]);
  });
});

describe("instruction steps", () => {
  it("reads headings and step photos, and writes them back the same way", () => {
    const saved = ["Make the sauce:", "Whisk 2 tbsp soy sauce.", { text: "Roast 20 minutes.", image: "/api/recipe-images/x" }];
    const steps = instructionsToSteps(saved);
    expect(strip(steps)).toEqual([
      { head: true, text: "Make the sauce" },
      { text: "Whisk 2 tbsp soy sauce.", image: null },
      { text: "Roast 20 minutes.", image: "/api/recipe-images/x" },
    ]);
    expect(stepsToInstructions(steps)).toEqual(saved);
  });

  it("skips empty steps and keeps a step that ends in a colon from turning into a heading", () => {
    expect(
      stepsToInstructions([
        { text: "  ", image: null },
        { head: true, text: "" },
        { text: "Add the following:", image: null },
      ])
    ).toEqual(["Add the following."]);
  });

  it("starts a blank recipe with one empty step", () => {
    expect(strip(instructionsToSteps([]))).toEqual([{ text: "", image: null }]);
  });
});

describe("recipeSlot", () => {
  it("uses the saved slot, falling back to an old meal tag", () => {
    expect(recipeSlot({ mealSlot: "prep", tags: ["dinner"] })).toBe("prep");
    expect(recipeSlot({ tags: ["Supper"] })).toBe("dinner");
    expect(recipeSlot({ tags: ["weeknight"] })).toBe(null);
  });
});

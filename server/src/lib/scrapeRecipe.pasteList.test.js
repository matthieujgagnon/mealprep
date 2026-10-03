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

describe("French recipes", () => {
  const parse = (text) => parseIngredientText(text).map(({ name, quantity, unit, notes }) => [quantity, unit, name, notes]);

  it("reads Quebec measures into the same units as English ones", () => {
    expect(
      parse(
        "2 tasses de farine\n1 c. à soupe d'huile d'olive\n2 c. à thé de cumin moulu\n1 c. à café de sel\n" +
          "3 c.à soupe de beurre\n2 cuillères à soupe d'huile\n1/2 c. à s. de miel\n500 g de bœuf haché\n2 l d'eau"
      )
    ).toEqual([
      [2, "cup", "Farine", null],
      [1, "tbsp", "Huile d'olive", null],
      [2, "tsp", "Cumin moulu", null],
      [1, "tsp", "Sel", null],
      [3, "tbsp", "Beurre", null],
      [2, "tbsp", "Huile", null],
      [0.5, "tbsp", "Miel", null],
      [500, "g", "Bœuf haché", null],
      [2, "l", "Eau", null],
    ]);
  });

  it("reads cloves, cans, bunches, slices and the like", () => {
    expect(
      parse(
        "3 gousses d'ail, hachées\n1 boîte (796 ml) de tomates en dés\n1 botte de coriandre\n4 tranches de bacon\n" +
          "2 branches de céleri, émincées\n1 tête d'ail\n2 pots de yogourt grec\n1 sachet de levure\n1 sac de 2 lb de carottes"
      )
    ).toEqual([
      [3, "clove", "Ail", "hachées"],
      [1, "can", "Tomates en dés", "796 ml"],
      [1, "bunch", "Coriandre", null],
      [4, "slice", "Bacon", null],
      [2, "stalk", "Céleri", "émincées"],
      [1, "head", "Ail", null],
      [2, "tub", "Yogourt grec", null],
      [1, "package", "Levure", null],
      [1, "bag", "Carottes", "2 lb"],
    ]);
  });

  it("reads decimal commas, un / une, notes and sections", () => {
    expect(parse("1,5 tasse de riz\nune pincée de sel\nun oignon, haché finement\nUn peu de persil\nSel et poivre, au goût")).toEqual([
      [1.5, "cup", "Riz", null],
      [1, "pinch", "Sel", null],
      [1, null, "Oignon", "haché finement"],
      [null, null, "Un peu de persil", null],
      [null, null, "Sel et poivre", "au goût"],
    ]);
    expect(parseIngredientText("Pour la sauce :\n2 c. à soupe de sauce soya\nPour la garniture\n1 lime").map((r) => [r.name, r.group])).toEqual([
      ["Sauce soya", "Pour la sauce"],
      ["Lime", "Pour la garniture"],
    ]);
  });

  it("leaves English lines as they were", () => {
    expect(parse("1 lb chicken\na pinch of salt\n1 tbsp butter, melted")).toEqual([
      [1, "lb", "Chicken", null],
      [null, null, "A pinch of salt", null],
      [1, "tbsp", "Butter", "melted"],
    ]);
  });
});

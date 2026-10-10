import { describe, expect, it } from "vitest";
import { splitStepParagraphs, stepParagraphText } from "./stepParagraphs.js";

const split = splitStepParagraphs;

describe("splitting at the end of a sentence", () => {
  it("starts a new paragraph where a sentence ends and the next begins with a capital", () => {
    expect(split("Spread the chicken on the sheet pan. Roast for 25 minutes, turning halfway.")).toEqual([
      "Spread the chicken on the sheet pan.",
      "Roast for 25 minutes, turning halfway.",
    ]);
  });

  it("works in French, with accented capitals", () => {
    expect(split("Étalez le poulet sur la plaque avec les oignons. Faites rôtir 25 minutes. Évitez d’ouvrir la porte.")).toEqual([
      "Étalez le poulet sur la plaque avec les oignons.",
      "Faites rôtir 25 minutes.",
      "Évitez d’ouvrir la porte.",
    ]);
    expect(split("Mélangez bien. À la fin, salez.")).toEqual(["Mélangez bien.", "À la fin, salez."]);
  });

  it("splits after ! and ? and after an ellipsis", () => {
    expect(split("Careful, it is hot! Let it cool.")).toEqual(["Careful, it is hot!", "Let it cool."]);
    expect(split("Is it golden? Take it out.")).toEqual(["Is it golden?", "Take it out."]);
    expect(split("Wait... Then stir.")).toEqual(["Wait...", "Then stir."]);
    expect(split("Mélangez ! Servez.")).toEqual(["Mélangez !", "Servez."]);
  });

  it("keeps a closing bracket or quote with its sentence", () => {
    expect(split("Stir well (about a minute). Then rest.")).toEqual(["Stir well (about a minute).", "Then rest."]);
    expect(split("Add the “secret” sauce. Serve.")).toEqual(["Add the “secret” sauce.", "Serve."]);
  });

  it("does not split when the next word is lower case, or inside a decimal", () => {
    expect(split("Add the oil. and stir")).toEqual(["Add the oil. and stir"]);
    expect(split("Add 1.5 cups of flour")).toEqual(["Add 1.5 cups of flour"]);
    expect(split("Add 1.5 cups. Mix well.")).toEqual(["Add 1.5 cups.", "Mix well."]);
  });
});

describe("no split after an abbreviation", () => {
  it.each([
    ["Heat 2 tbsp. Olive oil in a pan."],
    ["Add 1 tsp. Salt and stir."],
    ["Add 8 oz. Cream cheese."],
    ["Use 1 lb. Chicken thighs."],
    ["Bake for approx. Twenty minutes."],
    ["Cook for 5 min. Then stir."],
    ["Add 2 lbs. Potatoes, peeled."],
    ["Serve with fruit, nuts, etc. Then eat."],
    ["Ask Dr. Smith about it."],
  ])("%s stays one paragraph", (text) => {
    expect(split(text)).toEqual([text]);
  });

  it("works for the French abbreviations", () => {
    for (const text of [
      "Ajoutez env. Deux tasses de lait.",
      "Laissez reposer env. 5 min. Ensuite, servez.",
      "Ajoutez du sel, p. ex. Du sel de mer.",
      "Ajoutez 2 c.à.s. Huile d’olive.",
      "Mettez 1 c.à.c. Sucre.",
    ]) {
      expect(split(text), text).toEqual([text]);
    }
  });

  it("still splits after a French measure written out in full", () => {
    expect(split("Ajoutez 2 c. à soupe d’huile. Mélangez bien.")).toEqual(["Ajoutez 2 c. à soupe d’huile.", "Mélangez bien."]);
    expect(split("Ajoutez 1 c. à thé. Mélangez.")).toEqual(["Ajoutez 1 c. à thé.", "Mélangez."]);
  });
});

describe("no split after a number or a single letter", () => {
  it("keeps a numbered step or a bare quantity together", () => {
    expect(split("Step 1. Chop the onions.")).toEqual(["Step 1. Chop the onions."]);
    expect(split("Makes 12. Enjoy.")).toEqual(["Makes 12. Enjoy."]);
    expect(split("Add 1 1/2. Stir.")).toEqual(["Add 1 1/2. Stir."]);
    expect(split("Ajoutez ½. Mélangez.")).toEqual(["Ajoutez ½. Mélangez."]);
  });

  it("keeps a single letter with what follows", () => {
    expect(split("Take vitamin C. Then rest.")).toEqual(["Take vitamin C. Then rest."]);
    expect(split("Add 2 T. Butter.")).toEqual(["Add 2 T. Butter."]);
  });
});

describe("a period right after °F or °C ends a sentence", () => {
  it("splits after °F", () => {
    expect(split("Preheat to 350 °F. Line a sheet.")).toEqual(["Preheat to 350 °F.", "Line a sheet."]);
    expect(split("Preheat to 350°F. Line a sheet.")).toEqual(["Preheat to 350°F.", "Line a sheet."]);
    expect(split("Preheat the oven to 350 ºF. Line a sheet.")).toEqual(["Preheat the oven to 350 ºF.", "Line a sheet."]);
  });

  it("splits after °C, in French too", () => {
    expect(split("Préchauffez le four à 180 °C. Enfournez la plaque.")).toEqual(["Préchauffez le four à 180 °C.", "Enfournez la plaque."]);
    expect(split("Préchauffez à 350 °F. Tapissez une plaque.")).toEqual(["Préchauffez à 350 °F.", "Tapissez une plaque."]);
  });

  it("splits after “degrees F”, which is the same thing written out", () => {
    expect(split("Preheat to 350 degrees F. Line a sheet.")).toEqual(["Preheat to 350 degrees F.", "Line a sheet."]);
    expect(split("Préchauffez à 180 degrés C. Enfournez.")).toEqual(["Préchauffez à 180 degrés C.", "Enfournez."]);
  });

  it("still keeps a bare number together", () => {
    expect(split("Preheat to 350. Line a sheet.")).toEqual(["Preheat to 350. Line a sheet."]);
  });

  it("does not split a temperature that is not followed by a capital", () => {
    expect(split("Bake at 350 °F. until golden.")).toEqual(["Bake at 350 °F. until golden."]);
  });
});

describe("line breaks and edge cases", () => {
  it("keeps a line break that is already in the text", () => {
    expect(stepParagraphText("Prep the veg.\nChop the onion. Dice the carrot.")).toBe("Prep the veg.\nChop the onion.\n\nDice the carrot.");
  });

  it("returns the paragraphs joined by a blank line for the screen", () => {
    expect(stepParagraphText("Spread the chicken. Roast for 25 minutes.")).toBe("Spread the chicken.\n\nRoast for 25 minutes.");
  });

  it("returns nothing for empty or missing text", () => {
    expect(split("")).toEqual([]);
    expect(split("   ")).toEqual([]);
    expect(split(null)).toEqual([]);
    expect(split(undefined)).toEqual([]);
    expect(stepParagraphText("")).toBe("");
    expect(stepParagraphText(undefined)).toBe("");
  });

  it("leaves a single sentence, and text with no sentence end, alone", () => {
    expect(stepParagraphText("Stir until smooth")).toBe("Stir until smooth");
    expect(stepParagraphText("Stir until smooth.")).toBe("Stir until smooth.");
  });

  it("changes only the spacing: every word is still there, in order", () => {
    const text = "Preheat to 350 °F. Heat 2 tbsp. Olive oil. Stir in 1.5 cups of rice! Cover. Cook 18 min. Then rest.";
    expect(split(text).join(" ")).toBe(text);
  });

  it("does not split again what it already split", () => {
    const once = stepParagraphText("Preheat to 350 °F. Line a sheet. Bake 10 min. Then rest.");
    expect(stepParagraphText(once)).toBe(once);
  });
});

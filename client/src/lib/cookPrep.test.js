import { describe, expect, it } from "vitest";
import {
  buildPrep,
  celsiusToFahrenheit,
  doFirstSentence,
  fahrenheitToCelsius,
  howLine,
  prepGroup,
  prepNote,
  withBothTemperatures,
} from "./cookPrep.js";

describe("prepNote: which notes are preparation", () => {
  it("keeps a prep note and takes the brackets off", () => {
    expect(prepNote("diced")).toBe("diced");
    expect(prepNote("(minced)")).toBe("minced");
    expect(prepNote("  finely   chopped ")).toBe("finely chopped");
    expect(prepNote("cut into 2 oz pieces")).toBe("cut into 2 oz pieces");
    expect(prepNote("en dés de 3 cm")).toBe("en dés de 3 cm");
  });

  it("has nothing for an ingredient with no note", () => {
    expect(prepNote("")).toBe("");
    expect(prepNote(null)).toBe("");
    expect(prepNote(undefined)).toBe("");
    expect(prepNote("   ")).toBe("");
  });

  it("leaves out notes that are not something to do", () => {
    for (const note of [
      "to taste", "optional", "divided", "as needed", "if desired", "for serving", "for garnish",
      "low sodium", "Low-sodium", "reduced sodium", "unsalted", "salted", "organic", "store-bought",
      "boneless, skinless", "plus more for serving", "or to taste", "preferably organic",
      "796 ml", "14 oz can", "(15 oz)", "about 2 lb", "1 kg",
      "au goût", "selon le goût", "au besoin", "facultatif", "optionnel", "divisé", "pour servir",
      "faible en sodium", "réduit en sodium", "non salé", "biologique", "du commerce", "désossés",
    ]) {
      expect(prepNote(note), note).toBe("");
    }
  });

  it("drops the not-prep part of a note that also says what to do", () => {
    expect(prepNote("diced, divided")).toBe("diced");
    expect(prepNote("chopped, to taste")).toBe("chopped");
    expect(prepNote("finely chopped, plus extra for garnish")).toBe("finely chopped");
    expect(prepNote("optional, thinly sliced")).toBe("thinly sliced");
    expect(prepNote("haché, facultatif")).toBe("haché");
    expect(prepNote("tranché, pour servir")).toBe("tranché");
  });
});

describe("prepGroup", () => {
  it("puts cutting notes under Cut, in English and French", () => {
    for (const note of [
      "diced", "finely chopped", "thinly sliced", "minced", "peeled and cubed", "grated", "halved lengthwise",
      "cut into 3 cm pieces", "quartered", "shredded",
      "en dés", "en petits dés", "haché", "hachée finement", "tranchés", "émincée", "coupé en quartiers", "râpé", "pelées",
    ]) {
      expect(prepGroup(note), note).toBe("cut");
    }
  });

  it("puts zest and juice notes under Squeeze / zest", () => {
    for (const note of ["zest", "zested", "juiced", "zest and juice", "peeled and juiced", "pressed", "zeste", "jus", "pressé", "zeste et jus"]) {
      expect(prepGroup(note), note).toBe("squeeze");
    }
  });

  it("puts measuring notes under Measure", () => {
    for (const note of ["packed", "firmly packed", "heaping", "level", "scant", "measured", "bien tassé", "comble", "rase"]) {
      expect(prepGroup(note), note).toBe("measure");
    }
  });

  it("puts everything else under Other", () => {
    for (const note of ["room temperature", "drained and rinsed", "melted", "softened", "sifted", "à température ambiante", "égoutté", "fondu", "en purée"]) {
      expect(prepGroup(note), note).toBe("other");
    }
  });

  it("goes to Squeeze first, then Cut, then Measure", () => {
    expect(prepGroup("chopped and juiced")).toBe("squeeze");
    expect(prepGroup("chopped, packed")).toBe("cut");
    expect(prepGroup("measured, then chopped")).toBe("cut");
  });
});

describe("howLine", () => {
  it("turns a prep word into the order, English", () => {
    expect(howLine("diced")).toBe("Dice");
    expect(howLine("minced")).toBe("Mince");
    expect(howLine("finely chopped")).toBe("Finely chop");
    expect(howLine("thinly sliced")).toBe("Thinly slice");
    expect(howLine("peeled and diced")).toBe("Peel and dice");
    expect(howLine("peeled, cored and sliced")).toBe("Peel, core and slice");
    expect(howLine("drained and rinsed")).toBe("Drain and rinse");
    expect(howLine("melted")).toBe("Melt");
    expect(howLine("diced.")).toBe("Dice");
  });

  it("turns a prep word into « vous » orders, French", () => {
    expect(howLine("haché")).toBe("Hachez");
    expect(howLine("hachée")).toBe("Hachez");
    expect(howLine("émincés")).toBe("Émincez");
    expect(howLine("pelé et haché")).toBe("Pelez et hachez");
    expect(howLine("égouttées")).toBe("Égouttez");
    expect(howLine("fondu")).toBe("Faites fondre");
  });

  it("leaves « zeste et jus » alone: zeste is the noun", () => {
    expect(howLine("zeste et jus")).toBe("Zeste et jus");
    expect(howLine("zest and juice")).toBe("Zest and juice");
  });

  it("puts a French adverb after the verb", () => {
    expect(howLine("finement haché")).toBe("Hachez finement");
    expect(howLine("haché finement")).toBe("Hachez finement");
  });

  it("gives a shape its verb", () => {
    expect(howLine("en dés")).toBe("Coupez en dés");
    expect(howLine("en petits dés")).toBe("Coupez en petits dés");
    expect(howLine("en quartiers")).toBe("Coupez en quartiers");
    expect(howLine("en dés de 3 cm")).toBe("Coupez en dés de 3 cm");
    expect(howLine("en purée")).toBe("En purée");
  });

  it("leaves a note that is already an instruction as written, with a capital", () => {
    expect(howLine("cut into 3 cm pieces")).toBe("Cut into 3 cm pieces");
    expect(howLine("Keep 1 for the sauce")).toBe("Keep 1 for the sauce");
    expect(howLine("room temperature")).toBe("Room temperature");
    expect(howLine("à température ambiante")).toBe("À température ambiante");
    expect(howLine("packed")).toBe("Packed");
  });

  it("changes only the words that lead the note", () => {
    expect(howLine("diced into 1 cm cubes")).toBe("Dice into 1 cm cubes");
    expect(howLine("cubes of diced bread")).toBe("Cubes of diced bread");
  });

  it("never adds a size", () => {
    expect(howLine("diced")).not.toMatch(/\d/);
    expect(howLine("en dés")).not.toMatch(/\d/);
    expect(howLine("")).toBe("");
  });
});

describe("temperatures", () => {
  it("rounds the way ovens are set", () => {
    expect([250, 300, 325, 350, 375, 400, 425, 450].map(fahrenheitToCelsius)).toEqual([120, 150, 160, 180, 190, 200, 220, 230]);
    expect([120, 150, 160, 180, 190, 200, 220, 230].map(celsiusToFahrenheit)).toEqual([250, 300, 325, 350, 375, 400, 425, 450]);
  });

  it("adds the other unit after each temperature", () => {
    expect(withBothTemperatures("Preheat the oven to 425°F.")).toBe("Preheat the oven to 425 °F (220 °C).");
    expect(withBothTemperatures("Preheat the oven to 400F.")).toBe("Preheat the oven to 400 °F (200 °C).");
    expect(withBothTemperatures("Heat the oven to 350 degrees F.")).toBe("Heat the oven to 350 °F (180 °C).");
    expect(withBothTemperatures("Préchauffez le four à 220 °C.")).toBe("Préchauffez le four à 220 °C (425 °F).");
    expect(withBothTemperatures("Preheat to 400-425°F.")).toBe("Preheat to 400–425 °F (200–220 °C).");
  });

  it("leaves a sentence with both units, or none, as it is", () => {
    expect(withBothTemperatures("Preheat the oven to 350°F (180°C).")).toBe("Preheat the oven to 350°F (180°C).");
    expect(withBothTemperatures("Preheat the grill to high.")).toBe("Preheat the grill to high.");
    expect(withBothTemperatures("Bake 25 minutes.")).toBe("Bake 25 minutes.");
  });
});

describe("doFirstSentence", () => {
  it("is the first preheat sentence in the steps, with both units", () => {
    const steps = ["Prep: Mix the oil and spices.", "Roast: Preheat the oven to 425°F. Line a sheet pan.", "Preheat the broiler."];
    expect(doFirstSentence(steps)).toBe("Preheat the oven to 425 °F (220 °C).");
  });

  it("reads French, and keeps the rest of the sentence", () => {
    expect(doFirstSentence(["Préparation: Préchauffez le four à 220 °C et tapissez une plaque."])).toBe(
      "Préchauffez le four à 220 °C (425 °F) et tapissez une plaque."
    );
    expect(doFirstSentence(["Heat the oven to 220 °C and line a sheet pan."])).toBe("Heat the oven to 220 °C (425 °F) and line a sheet pan.");
  });

  it("finds it in the middle of a step", () => {
    expect(doFirstSentence(["Season the chicken. Preheat the oven to 200°C. Wait."])).toBe("Preheat the oven to 200 °C (400 °F).");
  });

  it("is null when no step sets up an oven", () => {
    expect(doFirstSentence(["Heat a pan over medium heat.", "Stir for 5 minutes."])).toBeNull();
    expect(doFirstSentence([])).toBeNull();
    expect(doFirstSentence(undefined)).toBeNull();
  });
});

describe("buildPrep", () => {
  const ingredients = Object.freeze([
    Object.freeze({ name: "chicken thighs", quantity: 900, unit: "g", notes: "diced" }),
    Object.freeze({ name: "olive oil", quantity: 2, unit: "tbsp", notes: null }),
    Object.freeze({ name: "garlic", quantity: 3, unit: "clove", notes: "(minced)" }),
    Object.freeze({ name: "lemon", quantity: 1, unit: null, notes: "zest and juice" }),
    Object.freeze({ name: "soy sauce", quantity: 2, unit: "tbsp", notes: "low sodium" }),
    Object.freeze({ name: "canned tomatoes", quantity: 1, unit: "can", notes: "796 ml" }),
    Object.freeze({ name: "butter", quantity: 2, unit: "tbsp", notes: "room temperature" }),
    Object.freeze({ name: "paprika", quantity: 1, unit: "tsp", notes: "to taste" }),
    Object.freeze({ name: "quinoa", quantity: 1, unit: "cup", notes: "rinsed" }),
  ]);
  const steps = [
    "Prep: Mix the olive oil and the paprika, then coat the chicken.",
    "Roast: Preheat the oven to 425°F. Spread the chicken on a pan with the garlic and roast 25 minutes.",
    "Sauce: Stir the lemon zest, the garlic and the butter together.",
  ];

  it("lists only the ingredients with a prep note, in the recipe's order", () => {
    const { rows } = buildPrep(ingredients, steps);
    expect(rows.map((r) => r.ingredient.name)).toEqual(["chicken thighs", "garlic", "lemon", "butter", "quinoa"]);
    expect(rows.map((r) => r.how)).toEqual(["Dice", "Mince", "Zest and juice", "Room temperature", "Rinse"]);
  });

  it("groups them Cut, Squeeze / zest, Other, with empty groups left out", () => {
    const { groups } = buildPrep(ingredients, steps);
    expect(groups.map((g) => g.id)).toEqual(["cut", "squeeze", "other"]);
    expect(groups[0].rows.map((r) => r.ingredient.name)).toEqual(["chicken thighs", "garlic"]);
    expect(groups[2].rows.map((r) => r.ingredient.name)).toEqual(["butter", "quinoa"]);
  });

  it("says which steps use each ingredient, none when no step does", () => {
    const { rows } = buildPrep(ingredients, steps);
    const byName = Object.fromEntries(rows.map((r) => [r.ingredient.name, r.stepNumbers]));
    expect(byName["chicken thighs"]).toEqual([1, 2]);
    expect(byName.garlic).toEqual([2, 3]);
    expect(byName.lemon).toEqual([3]);
    expect(byName.butter).toEqual([3]);
    expect(byName.quinoa).toEqual([]);
  });

  it("finds a short name in a French recipe", () => {
    const fr = [
      { name: "ail", quantity: 3, unit: "clove", notes: "haché" },
      { name: "riz", quantity: 1, unit: "cup", notes: "rincé" },
    ];
    const { rows } = buildPrep(fr, ["Hachez l'ail.", "Cuisez le riz 15 minutes."]);
    expect(rows.map((r) => r.stepNumbers)).toEqual([[1], [2]]);
    expect(rows.map((r) => r.how)).toEqual(["Hachez", "Rincez"]);
  });

  it("gives the recipe's own preheat sentence", () => {
    expect(buildPrep(ingredients, steps).doFirst).toBe("Preheat the oven to 425 °F (220 °C).");
    expect(buildPrep(ingredients, ["Mix everything."]).doFirst).toBeNull();
  });

  it("has no rows (so no page) when no ingredient has a prep note", () => {
    const none = [
      { name: "olive oil", notes: null },
      { name: "soy sauce", notes: "low sodium" },
      { name: "salt", notes: "to taste" },
    ];
    const prep = buildPrep(none, ["Preheat the oven to 400F.", "Mix."]);
    expect(prep.rows).toEqual([]);
    expect(prep.groups).toEqual([]);
    expect(buildPrep([], []).rows).toEqual([]);
    expect(buildPrep(undefined, undefined).rows).toEqual([]);
  });

  it("changes nothing in the recipe", () => {
    const before = JSON.stringify(ingredients);
    buildPrep(ingredients, steps);
    expect(JSON.stringify(ingredients)).toBe(before);
  });
});

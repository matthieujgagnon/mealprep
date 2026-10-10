import { describe, expect, it } from "vitest";
import { ingredientTerms, mentions } from "./ingredientMatch.js";
import { stepIngredients } from "./steps.js";

describe("mentions: short names and whole words", () => {
  it("finds a short name", () => {
    expect(mentions("Whisk the egg until pale.", "egg")).toBe(true);
    expect(mentions("Drizzle with oil.", "oil")).toBe(true);
    expect(mentions("Hachez l'ail finement.", "ail")).toBe(true);
    expect(mentions("Faites cuire le riz 15 minutes.", "riz")).toBe(true);
  });

  it("matches whole words only, not a word that merely contains the name", () => {
    expect(mentions("Bring to a boil.", "oil")).toBe(false);
    expect(mentions("Check the price of rice.", "rice")).toBe(true);
    expect(mentions("Check the price.", "rice")).toBe(false);
    expect(mentions("Roast the acorn squash.", "corn")).toBe(false);
    expect(mentions("Top with a hamburger patty.", "ham")).toBe(false);
    expect(mentions("Il fait chaud dans la cuisine.", "ail")).toBe(false);
  });

  it("ignores case and accents", () => {
    expect(mentions("Ajoutez les EPICES.", "épices")).toBe(true);
    expect(mentions("Ajoutez les épices.", "Epices")).toBe(true);
    expect(mentions("Cassez les oeufs.", "œufs")).toBe(true);
  });
});

describe("mentions: plural or singular, either way", () => {
  it("matches a singular name to a plural text and the other way round", () => {
    expect(mentions("Dice the tomatoes.", "tomato")).toBe(true);
    expect(mentions("Dice the tomato.", "tomatoes")).toBe(true);
    expect(mentions("Beat the eggs.", "egg")).toBe(true);
    expect(mentions("Beat the egg.", "eggs")).toBe(true);
    expect(mentions("Émincez les oignons.", "oignon")).toBe(true);
    expect(mentions("Émincez l'oignon.", "oignons")).toBe(true);
    expect(mentions("Add the chickpea flour.", "chickpeas")).toBe(true);
  });
});

describe("mentions: the other language", () => {
  it("finds an English name in a French step, and a French name in an English one", () => {
    expect(mentions("Hachez l'ail et faites-le revenir.", "garlic")).toBe(true);
    expect(mentions("Mince the garlic.", "ail")).toBe(true);
    expect(mentions("Rincez le riz.", "rice")).toBe(true);
    expect(mentions("Rinse the rice.", "riz")).toBe(true);
    expect(mentions("Beat the eggs.", "œufs")).toBe(true);
    expect(mentions("Battez les oeufs.", "egg")).toBe(true);
    expect(mentions("Mélangez le poulet.", "chicken thighs")).toBe(true);
    expect(mentions("Brown the chicken.", "hauts de cuisse de poulet")).toBe(true);
  });

  it("uses a French phrase as a whole: pommes de terre are potatoes, not apples", () => {
    expect(mentions("Épluchez les pommes de terre.", "potatoes")).toBe(true);
    expect(mentions("Boil the potatoes.", "pommes de terre")).toBe(true);
  });

  it("does not match through a word that is common in the other language", () => {
    // "the" is a word in English and « thé » once the accent goes; « mais » is "but".
    expect(mentions("Add the sugar.", "tea")).toBe(false);
    expect(mentions("Ajoutez le sel, mais pas trop.", "corn")).toBe(false);
    expect(mentions("Ajoutez le sel, mais pas trop.", "maïs")).toBe(false);
  });

  it("still finds corn when it is written « maïs »", () => {
    expect(mentions("Ajoutez le maïs égoutté.", "corn")).toBe(true);
    expect(mentions("Add the corn.", "maïs")).toBe(true);
    expect(mentions("Ajoutez le maïs.", "maïs")).toBe(true);
    expect(mentions("Ajoutez le maïs.", "mais")).toBe(true);
  });
});

describe("mentions: words that don't say what the food is", () => {
  it("does not match on a colour, a size or 'fresh'", () => {
    expect(mentions("Add the red pepper.", "red onion")).toBe(false);
    expect(mentions("Slice the onion.", "red onion")).toBe(true);
    expect(mentions("Add the fresh parsley.", "fresh basil")).toBe(false);
    expect(mentions("Add the ground cumin.", "ground beef")).toBe(false);
    expect(mentions("Ajoutez le poivron rouge.", "oignon rouge")).toBe(false);
  });

  it("does not match on a little word", () => {
    expect(mentions("Mélangez le yogourt avec la sauce.", "huile d'olive")).toBe(false);
    expect(mentions("Serve with a side of rice.", "salt and pepper")).toBe(false);
  });
});

describe("mentions: short words in a longer name", () => {
  it("does not match on a short word that says nothing about the food", () => {
    expect(mentions("Dry the chicken well.", "dry white wine")).toBe(false);
    expect(mentions("Add the wine.", "dry white wine")).toBe(true);
    expect(mentions("Add all the vegetables.", "all-purpose flour")).toBe(false);
    expect(mentions("Sift the flour.", "all-purpose flour")).toBe(true);
    expect(mentions("Trim the fat.", "low-fat milk")).toBe(false);
    expect(mentions("Pour the milk.", "low-fat milk")).toBe(true);
    expect(mentions("Mix the sauce.", "salad mix")).toBe(false);
    expect(mentions("Toss the salad.", "salad mix")).toBe(true);
    expect(mentions("Add a free-range egg.", "gluten-free pasta")).toBe(false);
  });

  it("still matches a short food word, alone or beside others", () => {
    expect(mentions("Add the soy.", "soy sauce")).toBe(true);
    expect(mentions("Drizzle with oil.", "olive oil")).toBe(true);
    expect(mentions("Beat the egg.", "egg noodles")).toBe(true);
    expect(mentions("Add the bay.", "bay leaves")).toBe(true);
    expect(mentions("Ajoutez l'huile.", "olive oil")).toBe(true);
    expect(mentions("Ajoutez le beurre.", "butter")).toBe(true);
  });
});

describe("ingredientTerms", () => {
  it("gives singular words with no accents, and the other language's word", () => {
    const terms = ingredientTerms("Gousses d'ail");
    expect(terms.has("ail")).toBe(true);
    expect(terms.has("garlic")).toBe(true);
    expect([...ingredientTerms("tomatoes")]).toContain("tomato");
    expect([...ingredientTerms("épices shawarma")]).toContain("epice");
  });

  it("is empty for a name made only of little words", () => {
    expect(ingredientTerms("the").size).toBe(0);
  });
});

describe("stepIngredients keeps working on whole recipes", () => {
  const ingredients = [
    { name: "hauts de cuisse de poulet" },
    { name: "ail" },
    { name: "riz" },
    { name: "huile d'olive" },
    { name: "citron" },
  ];

  it("finds each short French name in a French step", () => {
    const step = "Préparation: Hachez l'ail. Rincez le riz et arrosez le poulet d'huile d'olive.";
    expect(stepIngredients(step, ingredients).map((i) => i.name)).toEqual([
      "hauts de cuisse de poulet",
      "ail",
      "riz",
      "huile d'olive",
    ]);
  });

  it("finds French ingredients in an English step, in the recipe's own order", () => {
    const step = "Rice with garlic and a squeeze of lemon.";
    expect(stepIngredients(step, ingredients).map((i) => i.name)).toEqual(["ail", "riz", "citron"]);
  });

  it("returns the recipe's own ingredient objects", () => {
    const list = [{ name: "egg", id: 7 }];
    expect(stepIngredients("Crack the eggs.", list)[0]).toBe(list[0]);
  });
});

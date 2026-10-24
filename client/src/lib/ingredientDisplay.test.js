import { describe, expect, it } from "vitest";
import {
  ambiguous,
  conflicts,
  describing,
  ingredientName,
  ingredientNote,
  ingredientRows,
  isKnownIngredient,
  isKnownNote,
  prepWords,
} from "./ingredientDisplay.js";

// The same way the helper writes a name down to compare it.
const keyOf = (text) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/gi, "oe")
    .toLowerCase()
    .replace(/['’-]/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const fr = (name) => ingredientName(name, "fr");
const en = (name) => ingredientName(name, "en");

describe("the table", () => {
  it("has a line for every common ingredient, and no written name on two lines", () => {
    expect(ingredientRows.length).toBeGreaterThan(300);
    expect(conflicts).toEqual([]);
  });

  it("gives every line all four forms and a gender", () => {
    const bad = ingredientRows.filter(
      (row) => !row.gender || !row.en.one.length || !row.en.other.length || !row.fr.one.length || !row.fr.other.length
    );
    expect(bad.map((row) => row.line)).toEqual([]);
  });

  it("gives every describing word and prep word its four French forms", () => {
    expect(describing.filter((w) => w.fr.length !== 4 || !["before", "after", "colour"].includes(w.place)).map((w) => w.en)).toEqual([]);
    expect(prepWords.filter((w) => w.fr.length !== 4 || w.fr.some((f) => !f)).map((w) => w.en)).toEqual([]);
  });
});

describe("a name in English shown in French", () => {
  it("shows the whole name, singular or plural as written", () => {
    expect(fr("onion")).toBe("oignon");
    expect(fr("onions")).toBe("oignons");
    expect(fr("garlic cloves")).toBe("gousses d'ail");
    expect(fr("chicken thighs")).toBe("hauts de cuisse de poulet");
    expect(fr("all-purpose flour")).toBe("farine tout usage");
    expect(fr("blueberries")).toBe("bleuets");
    expect(fr("soy sauce")).toBe("sauce soya");
  });

  it("makes the describing words agree with the name", () => {
    expect(fr("red onions")).toBe("oignons rouges");
    expect(fr("fresh cilantro")).toBe("coriandre fraîche");
    expect(fr("fresh basil")).toBe("basilic frais");
    expect(fr("boneless skinless chicken breasts")).toBe("poitrines de poulet désossées sans peau");
    expect(fr("frozen peas")).toBe("pois surgelés");
    expect(fr("frozen spinach")).toBe("épinards surgelés");
    expect(fr("unsalted butter")).toBe("beurre non salé");
    expect(fr("canned tomatoes")).toBe("tomates en conserve");
    expect(fr("large red onion")).toBe("gros oignon rouge");
    expect(fr("roasted red peppers")).toBe("poivrons rouges rôtis");
    expect(fr("dried oregano")).toBe("origan séché");
    expect(fr("lean ground beef")).toBe("bœuf haché maigre");
  });

  it("does not turn a red pepper into a pepper that is red", () => {
    expect(fr("red pepper")).toBe("poivron rouge");
    expect(fr("green peppers")).toBe("poivrons verts");
    expect(fr("black pepper")).toBe("poivre noir");
  });

  it("reads several foods on one line", () => {
    expect(fr("salt and pepper")).toBe("sel et poivre");
    expect(fr("butter or margarine")).toBe("beurre ou margarine");
  });

  it("keeps the way the name began", () => {
    expect(fr("Red onions")).toBe("Oignons rouges");
    expect(fr("GARLIC")).toBe("AIL");
    expect(en("moutarde de Dijon")).toBe("Dijon mustard");
  });
});

describe("a name in French shown in English", () => {
  it("goes back the same way", () => {
    expect(en("oignons rouges")).toBe("red onions");
    expect(en("Coriandre fraîche")).toBe("Fresh cilantro");
    expect(en("hauts de cuisse de poulet")).toBe("chicken thighs");
    expect(en("poivrons rouges rôtis")).toBe("roasted red peppers");
    expect(en("gousse d'ail")).toBe("garlic clove");
    expect(en("gousse d’ail")).toBe("garlic clove");
    expect(en("sel et poivre")).toBe("salt and pepper");
  });

  it("shows every written form of every line as the other language's first form, same number", () => {
    const wrong = [];
    // A form that reads the same in both numbers (« noix de cajou ») cannot say which one it is, and a
    // form that is also the other language's own (« aubergine », "tofu") is left as it is.
    const check = (from, to, number, form, row) => {
      const key = keyOf(form);
      if (ambiguous.includes(key)) return;
      if (number === "other" && row[from].one.some((f) => keyOf(f) === key)) return;
      if (row[to][number].some((f) => keyOf(f) === key)) return;
      const shown = ingredientName(form, to);
      if (shown !== row[to][number][0]) wrong.push(`${form} -> ${shown} (wanted ${row[to][number][0]})`);
    };
    for (const row of ingredientRows) {
      for (const number of ["one", "other"]) {
        for (const form of row.en[number]) check("en", "fr", number, form, row);
        for (const form of row.fr[number]) check("fr", "en", number, form, row);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("does not take a proper name's capital for a sentence's", () => {
    expect(fr("Roma tomatoes")).toBe("tomates Roma");
    expect(en("moutarde de Dijon")).toBe("Dijon mustard");
    expect(fr("Dijon mustard")).toBe("moutarde de Dijon");
    expect(en("Sauce Worcestershire")).toBe("Worcestershire sauce");
  });

  it("does not guess a word that is a different ingredient in each language", () => {
    expect(ambiguous.sort()).toEqual(["raisin", "raisins"]);
    expect(fr("raisins")).toBe("raisins");
    expect(en("raisins")).toBe("raisins");
    expect(fr("grapes")).toBe("raisins");
    expect(en("raisins secs")).toBe("raisins");
  });
});

describe("what is left as written", () => {
  it("leaves a name that is already in the language asked for", () => {
    expect(fr("Oignons rouges")).toBe("Oignons rouges");
    expect(en("red onions")).toBe("red onions");
    expect(fr("tofu")).toBe("tofu");
    expect(en("tofu")).toBe("tofu");
  });

  it("leaves a name that is not in the table", () => {
    expect(fr("Biryani masala")).toBe("Biryani masala");
    expect(fr("a pinch of this and that")).toBe("a pinch of this and that");
    expect(en("Poutine sauce maison")).toBe("Poutine sauce maison");
  });

  it("leaves a name with a word it does not know, not half translated", () => {
    expect(fr("fluffy onions")).toBe("fluffy onions");
    expect(fr("")).toBe("");
    expect(fr(null)).toBe("");
  });

  it("knows what it knows", () => {
    expect(isKnownIngredient("red onions")).toBe(true);
    expect(isKnownIngredient("oignons rouges")).toBe(true);
    expect(isKnownIngredient("Biryani masala")).toBe(false);
  });
});

describe("a note", () => {
  it("agrees with the ingredient it belongs to", () => {
    expect(ingredientNote("chopped", "onions", "fr")).toBe("hachés");
    expect(ingredientNote("chopped", "garlic", "fr")).toBe("haché");
    expect(ingredientNote("chopped", "tomatoes", "fr")).toBe("hachées");
    expect(ingredientNote("melted", "butter", "fr")).toBe("fondu");
    expect(ingredientNote("diced", "red peppers", "fr")).toBe("coupés en dés");
    expect(ingredientNote("grated", "Parmesan", "fr")).toBe("râpé");
  });

  it("puts the adverb after the word in French and before it in English", () => {
    expect(ingredientNote("finely chopped", "onions", "fr")).toBe("hachés finement");
    expect(ingredientNote("thinly sliced", "carrots", "fr")).toBe("tranchées finement");
    expect(ingredientNote("hachés finement", "oignons", "en")).toBe("minced");
    expect(ingredientNote("tranchées finement", "carottes", "en")).toBe("finely sliced");
  });

  it("reads several words and fixed phrases", () => {
    expect(ingredientNote("peeled and chopped", "carrots", "fr")).toBe("pelées et hachées");
    expect(ingredientNote("to taste", "salt", "fr")).toBe("au goût");
    expect(ingredientNote("at room temperature", "butter", "fr")).toBe("à température ambiante");
    expect(ingredientNote("melted, optional", "butter", "fr")).toBe("fondu, facultatif");
  });

  it("is shown as written when any word is unknown or the ingredient is", () => {
    expect(ingredientNote("cut into 1-inch cubes", "onions", "fr")).toBe("cut into 1-inch cubes");
    expect(ingredientNote("chopped and fluffed", "onions", "fr")).toBe("chopped and fluffed");
    expect(ingredientNote("chopped", "Biryani masala", "fr")).toBe("chopped");
    expect(ingredientNote("haché", "oignons", "fr")).toBe("haché");
    expect(ingredientNote("haché et chopped", "oignons", "fr")).toBe("haché et chopped");
  });

  it("is read when it is part of the name", () => {
    expect(fr("garlic, minced")).toBe("ail, haché finement");
    expect(fr("tomatoes (diced)")).toBe("tomates (coupées en dés)");
    expect(fr("garlic, cut like a pro")).toBe("garlic, cut like a pro");
    expect(isKnownNote("finely chopped")).toBe(true);
    expect(isKnownNote("hachés finement")).toBe(true);
    expect(isKnownNote("cut into 1-inch cubes")).toBe(false);
  });
});

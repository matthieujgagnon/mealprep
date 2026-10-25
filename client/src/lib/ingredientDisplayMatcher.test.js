import { afterEach, describe, expect, it } from "vitest";
import { ambiguous, describing, effectiveIngredientRows, ingredientRows, setIngredientOverrides } from "./ingredientDisplay.js";
import { foodProfile, itemCovers } from "./inventoryMatch.js";

// The names in ingredientDisplay.txt (and Matt's changes to them) are what the app SHOWS, and the
// Inventory matcher (inventoryMatch.js) learns its French from the same list: every French
// spelling of a row is read as the row's English name, so « banane » is "banana" and a row Matt
// adds counts for « J'en ai » at once. The two must never disagree about what a name is: if the
// table says « oignon » is "onion", the matcher must read both as the same food, or a recipe would
// say one thing and the "you have it" mark another.
//
// This test is what keeps it so, for the built-in rows and for the list with changes on top of it.

afterEach(() => setIngredientOverrides([]));

const same = (a, b) => itemCovers(a, b) && itemCovers(b, a);
const keyOf = (text) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// The rows (by English singular) whose French the matcher reads differently on purpose, and why.
// A row listed here must still disagree (the test fails when it starts to agree, so the line
// comes off); a row that is not listed must agree.
const READ_DIFFERENTLY = {
  // « raisin » is a grape in French and a dried grape in English ("raisins"). The table reads
  // neither, because the spelling is a different ingredient in each language, and the matcher keeps
  // the reading it always had: « raisins » and "raisins" are grapes.
  grape: "« raisin » is a different ingredient in each language, so the table does not read it",
  raisin: "English 'raisins' is read as grapes (« raisins »), as it always was",
  // « thé » is never read as tea: "the" is an English word.
  tea: "« thé » is never read, because 'the' is an English word",
};

// The same for the describing words (checked on the plain masculine form).
const WORDS_READ_DIFFERENTLY = {
  // « salé » is never read: "sale" is an English word.
  salted: "« salé » is never read, because 'sale' is an English word",
};

const disagreeing = (rows) =>
  rows.filter((row) => ["one", "other"].some((number) => !same(row.en[number][0], row.fr[number][0]))).map((row) => row.en.one[0]);

describe("the display names and the Inventory matcher", () => {
  const builtIn = disagreeing(ingredientRows);

  it("agree on every row, in both directions (English covers French and French covers English)", () => {
    // A row here is either wrong (fix the table) or one the matcher reads on purpose differently
    // (add it to READ_DIFFERENTLY above, with the reason).
    expect(builtIn.filter((name) => !(name in READ_DIFFERENTLY))).toEqual([]);
  });

  it("have no row listed as read differently that the matcher now reads", () => {
    expect(Object.keys(READ_DIFFERENTLY).filter((name) => !builtIn.includes(name))).toEqual([]);
  });

  it("read the French singular and plural of a row as its English", () => {
    for (const [french, english] of [
      ["banane", "banana"], ["bananes", "bananas"], ["oignon rouge", "red onion"], ["coriandre fraîche", "fresh cilantro"],
      ["gousse d'ail", "garlic clove"], ["chou-fleur", "cauliflower"], ["amandes", "almond"], ["jaunes d'œufs", "egg yolk"],
    ]) {
      expect(same(french, english), `${french} / ${english}`).toBe(true);
    }
  });

  it("never read a row's French as the food of a different row", () => {
    // Compared on what the matcher keeps of a name: the food, what it was made into, the colour or
    // variety. (Cuts are left out: it folds « côtelette de porc » into pork, by its own rule.)
    const reading = (name) => {
      const p = foodProfile(name);
      return [p.food, p.derived, p.part, [...p.kinds].sort().join(",")].join("|");
    };
    const byEnglishReading = new Map();
    for (const row of ingredientRows) {
      const key = reading(row.en.one[0]);
      byEnglishReading.set(key, [...(byEnglishReading.get(key) || []), row]);
    }
    const misread = [];
    for (const row of ingredientRows) {
      const english = row.en.one[0];
      const french = row.fr.one[0];
      if (ambiguous.includes(keyOf(english)) || ambiguous.includes(keyOf(french))) continue;
      const read = reading(french);
      if (read === reading(english)) continue;
      for (const other of byEnglishReading.get(read) || []) if (other !== row) misread.push(`« ${french} » is read as "${other.en.one[0]}", not "${english}"`);
    }
    expect(misread).toEqual([]);
  });
});

describe("the display names with Matt's changes on top, and the Inventory matcher", () => {
  // A change that adds an ingredient, one that replaces a built-in row with other spellings, one that
  // hides a built-in row, and one that adds a French spelling to a row.
  const changes = [
    { id: "a1", replaces: null, hidden: false, enOne: "kohlrabi", enOther: "kohlrabis", frOne: "chou-rave", frOther: "choux-raves", gender: "m" },
    { id: "r1", replaces: "garlic clove", hidden: false, enOne: "garlic clove", enOther: "garlic cloves", frOne: "caïeu d'ail/gousse d'ail", frOther: "caïeux d'ail/gousses d'ail", gender: "m" },
    { id: "h1", replaces: "shallot", hidden: true, enOne: "", enOther: "", frOne: "", frOther: "", gender: "" },
    { id: "c1", replaces: "onion", hidden: false, enOne: "onion", enOther: "onions", frOne: "oignon/oignon jaune", frOther: "oignons/oignons jaunes", gender: "m" },
  ];

  it("agree on every row of the merged list", () => {
    setIngredientOverrides(changes);
    const rows = effectiveIngredientRows();
    expect(rows.some((row) => row.en.one[0] === "kohlrabi")).toBe(true);
    expect(rows.some((row) => row.en.one[0] === "shallot")).toBe(false);
    expect(disagreeing(rows).filter((name) => !(name in READ_DIFFERENTLY))).toEqual([]);
  });

  it("agree on a changed row's every French spelling, singular and plural", () => {
    setIngredientOverrides(changes);
    expect(same("caïeu d'ail", "garlic clove")).toBe(true);
    expect(same("caïeux d'ail", "garlic cloves")).toBe(true);
    expect(same("oignon jaune", "yellow onion")).toBe(true);
    expect(same("choux-raves", "kohlrabi")).toBe(true);
  });
});

describe("the describing words and the Inventory matcher", () => {
  // "small" goes before the name in French (« petit oignon »), the rest after it.
  const sample = (word) =>
    word.place === "before" ? [`${word.en} onion`, `${word.fr[0]} oignon`] : [`${word.en} rice`, `riz ${word.fr[0]}`];
  const unread = describing.filter((word) => !same(...sample(word))).map((word) => word.en);

  it("agree, in both languages, on every word except the ones read differently on purpose", () => {
    expect(unread.filter((word) => !(word in WORDS_READ_DIFFERENTLY))).toEqual([]);
  });

  it("have no word listed as read differently that the matcher now reads", () => {
    expect(Object.keys(WORDS_READ_DIFFERENTLY).filter((word) => !unread.includes(word))).toEqual([]);
  });
});

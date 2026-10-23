import { describe, expect, it } from "vitest";
import { ambiguous, describing, ingredientRows } from "./ingredientDisplay.js";
import { foodProfile, itemCovers } from "./inventoryMatch.js";

// The names in ingredientDisplay.txt are what the app SHOWS. The Inventory matcher
// (inventoryMatch.js) decides what is HAD. They must never disagree about what a name is:
// if the table says « oignon » is "onion", the matcher must read both as the same food,
// or a recipe would say one thing and the "you have it" mark another.
//
// The matcher is not touched by the display names and does not read the table. This test
// is the only thing that ties them: it fails when a line is added or changed so that the
// matcher no longer agrees, or when the matcher learns a word and a line below can come off.

const same = (a, b) => itemCovers(a, b) && itemCovers(b, a);

// Lines whose French the matcher cannot read yet: it knows « bananes » but not « banane »,
// for example, so an Inventory item « Banane » does not count for a recipe's "bananas".
// That is the matcher's gap, not the table's (the French here is right); it is listed
// here, by the English singular, so it is on record and the test stays exact: when the
// matcher learns one, the test fails until the name comes off this list.
const MATCHER_DOES_NOT_KNOW_YET = [
  "garlic clove", "head of garlic", "cherry tomato", "grape tomato", "crushed tomatoes", "celery stalk", "orange pepper",
  "jalapeno pepper", "chili pepper", "cauliflower", "Brussels sprout", "kale", "mixed greens", "arugula", "pea", "green pea",
  "snow pea", "green bean", "beet", "radish", "parsnip", "butternut squash", "pumpkin", "artichoke", "black olive",
  "flat-leaf parsley", "mint", "dill", "sage", "chives", "tarragon", "lemongrass", "banana", "grapefruit", "blackberry",
  "cranberry", "cherry", "peach", "pear", "plum", "grape", "raisin", "watermelon", "pomegranate", "fig", "date", "apricot",
  "coconut", "pork tenderloin", "Italian sausage", "duck", "scallop", "mussel", "crab", "anchovy", "skim milk", "buttermilk",
  "cheese", "goat cheese", "egg yolk", "coconut oil", "oyster sauce", "hot sauce", "vegetable broth", "whole wheat flour",
  "powdered sugar", "yeast", "cocoa powder", "chocolate chip", "dark chocolate", "jasmine rice", "rolled oats", "breadcrumbs",
  "pie crust", "shredded coconut", "black bean", "kidney bean", "almond", "walnut", "pecan", "cashew", "peanut", "pine nut",
  "pistachio", "hazelnut", "sesame seed", "sunflower seed", "chia seed", "pumpkin seed", "cinnamon stick", "coriander seeds",
  "saffron", "vanilla", "tea",
];

// The same for the describing words ("black rice" is « riz noir »), checked on the plain
// masculine form.
const MATCHER_DOES_NOT_KNOW_THESE_WORDS_YET = [
  "black", "brown", "purple", "small", "medium", "ripe", "canned", "raw", "skinless", "light", "plain", "salted", "organic",
];

describe("the display names and the Inventory matcher", () => {
  const disagreeing = ingredientRows
    .filter((row) => ["one", "other"].some((number) => !same(row.en[number][0], row.fr[number][0])))
    .map((row) => row.en.one[0]);

  it("agree on every line, in both directions (English covers French and French covers English)", () => {
    const newlyWrong = disagreeing.filter((name) => !MATCHER_DOES_NOT_KNOW_YET.includes(name));
    // A line here is either wrong (fix the table) or the matcher does not read that French yet
    // (add it to MATCHER_DOES_NOT_KNOW_YET above, and say so in the pull request).
    expect(newlyWrong).toEqual([]);
  });

  it("have no line listed as unknown that the matcher now reads", () => {
    expect(MATCHER_DOES_NOT_KNOW_YET.filter((name) => !disagreeing.includes(name))).toEqual([]);
  });

  it("never read a line's French as the food of a different line", () => {
    // Compared on what the matcher keeps of a name: the food, what it was made into, the colour or
    // variety. (Cuts are left out: it folds « côtelette de porc » into pork, by its own rule.)
    const reading = (name) => {
      const p = foodProfile(name);
      return [p.food, p.derived, [...p.kinds].sort().join(",")].join("|");
    };
    const keyOf = (text) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
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

describe("the describing words and the Inventory matcher", () => {
  // "small" goes before the name in French (« petit oignon »), the rest after it.
  const sample = (word) =>
    word.place === "before" ? [`${word.en} onion`, `${word.fr[0]} oignon`] : [`${word.en} rice`, `riz ${word.fr[0]}`];
  const disagreeing = describing.filter((word) => !same(...sample(word))).map((word) => word.en);

  it("agree, in both languages, on every word except the ones the matcher does not read yet", () => {
    expect(disagreeing.filter((word) => !MATCHER_DOES_NOT_KNOW_THESE_WORDS_YET.includes(word))).toEqual([]);
  });

  it("have no word listed as unknown that the matcher now reads", () => {
    expect(MATCHER_DOES_NOT_KNOW_THESE_WORDS_YET.filter((word) => !disagreeing.includes(word))).toEqual([]);
  });
});

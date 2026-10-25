import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { itemCovers } from "./inventoryMatch.js";

// The wide check: the matcher, asked about every real name against every other.
//
// fixtures/inventoryMatchNames.json is a long list of real names: TheMealDB's
// ingredients, FoodKeeper's products, every spelling of the ingredient names table in both
// languages, the matcher's own French words and the ingredient names the tests and the browser
// tests use (scripts/inventoryMatchWide.mjs builds it). fixtures/inventoryMatchBaseline.json is
// what the matcher answered for them when it began to read its French from that table: for each
// name as an Inventory item, the names (as recipe ingredients) it covered.
//
// A change to the matcher must not lose one of those matches without somebody
// meaning to. If this test fails, look at the pair it names: if it is a wrong match
// going away, add it to GONE_ON_PURPOSE below with the reason, and rebuild the
// baseline (`node scripts/inventoryMatchWide.mjs matches`); if it is a real match,
// the change is wrong.

const read = (file) => JSON.parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8"));
const names = read("inventoryMatchNames.json");
const baseline = read("inventoryMatchBaseline.json");

// Matches that went away on purpose when the French came from the table (the old matcher's answers
// are in the pull request): a few of each kind, in both languages and both directions.
//   - an egg covers its yolk and its white, one way only: a yolk or a white no longer covers an egg
//     (and « jaune d'œuf » was read as a yellow egg, so it covered every egg);
//   - « pilon de poulet » and « côtelette de porc » were unknown words in the singular, so each
//     covered every cut of the animal; they are a drumstick and a pork chop now;
//   - a green or red bean is its own food in English, so « haricot vert » and « haricot rouge » no
//     longer cover (or are covered by) plain beans;
//   - « citron vert » is a lime, so « citrons verts » no longer covers lemons.
const GONE_ON_PURPOSE_FRENCH_AND_EGGS = [
  ["egg white", "egg"],
  ["egg whites", "eggs"],
  ["Egg White", "large eggs"],
  ["egg yolk", "egg"],
  ["jaune d'œuf", "œuf"],
  ["jaunes d'œufs", "œufs"],
  ["blanc d'œuf", "egg"],
  ["blancs d'oeufs", "large eggs"],
  ["chicken thighs", "pilon de poulet"],
  ["chicken breast", "pilon de poulet"],
  ["aile de poulet", "pilon de poulet"],
  ["pilon de poulet", "chicken wings"],
  ["pilon de poulet", "poitrine de poulet"],
  ["côtelette de porc", "pork tenderloin"],
  ["cotelette de porc", "ground pork"],
  ["pork tenderloin", "côtelette de porc"],
  ["bean", "haricot vert"],
  ["beans", "haricot rouge"],
  ["haricot vert", "bean"],
  ["haricot rouge", "beans"],
  ["citrons verts", "lemon"],
  ["citrons verts", "citron"],
  ["citron", "citrons verts"],
];

// Wrong matches that went away on purpose, both ways round where they were both:
//   - lime, banana, grape, vine and curry leaves are products of their own, never the
//     fruit or the plant (and "grape leaves" were "raisins");
//   - a red vinegar is red wine vinegar, which plain vinegar never covered.
// They stay gone.
const GONE_ON_PURPOSE = [
  ["banana", "banana leaves"],
  ["banana leaves", "banana"],
  ["banana leaves", "bananas"],
  ["banana leaves", "bananes"],
  ["bananas", "banana leaves"],
  ["bananes", "banana leaves"],
  ["citron vert", "lime leaves"],
  ["curry", "curry leaves"],
  ["curry leaves", "curry"],
  ["grape", "grape leaves"],
  ["grape leaves", "grape"],
  ["grape leaves", "grapes"],
  ["grape leaves", "light raisins"],
  ["grape leaves", "raisins"],
  ["grapes", "grape leaves"],
  ["kaffir lime", "kaffir lime leaves"],
  ["kaffir lime leaves", "kaffir lime"],
  ["light raisins", "grape leaves"],
  ["lime", "lime leaves"],
  ["lime leaves", "citron vert"],
  ["lime leaves", "lime"],
  ["lime leaves", "limes"],
  ["limes", "lime leaves"],
  ["pickled", "pickled grape leaves"],
  ["pickled grape leaves", "pickled"],
  ["raisins", "grape leaves"],
  ["red vinegar", "vinaigre"],
  ["red vinegar", "vinegar"],
  ["vinaigre", "red vinegar"],
  ["vinaigre", "vinaigre rouge"],
  ["vinaigre rouge", "vinaigre"],
  ["vinaigre rouge", "vinegar"],
  ["vine", "vine leaves"],
  ["vine leaves", "vine"],
  ["vinegar", "red vinegar"],
  ["vinegar", "vinaigre rouge"],
];

describe("the wide check over real names", () => {
  it("lists a few thousand names and what they covered", () => {
    expect(names.length).toBeGreaterThan(3000);
    expect(baseline).toHaveLength(names.length);
    expect(baseline.reduce((n, row) => n + row.length, 0)).toBeGreaterThan(26000);
  });

  it("still covers every name it covered", () => {
    const lost = [];
    baseline.forEach((row, i) => {
      for (const j of row) if (!itemCovers(names[i], names[j])) lost.push(`${names[i]} -> ${names[j]}`);
    });
    expect(lost).toEqual([]);
  });

  it.each([...GONE_ON_PURPOSE, ...GONE_ON_PURPOSE_FRENCH_AND_EGGS])("%s does not cover %s, as it should not", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(false);
  });
});

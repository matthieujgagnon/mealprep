import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { itemCovers } from "./inventoryMatch.js";

// The wide check: the matcher, asked about every real name against every other.
//
// fixtures/inventoryMatchNames.json is a long list of real names: TheMealDB's
// ingredients, FoodKeeper's products, every spelling of the ingredient names table in both
// languages, the matcher's own French words and the ingredient names the tests and the browser
// tests use (scripts/inventoryMatchWide.mjs builds it). fixtures/inventoryMatchBaseline.json is
// what the matcher answered for them when dried and smoked became foods of their own (it was rebuilt
// then; before that it was what the matcher answered when it began to read its French from the
// table): for each name as an Inventory item, the names (as recipe ingredients) it covered.
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

// Wrong matches that went away on purpose when a name that is made from an animal, or a variety,
// stopped being read as the animal or the plain food (a few of each kind, both directions). The French
// names the table gave the matcher would otherwise have inherited every one of them:
//   - sausage, bacon, ham, chorizo, prosciutto and pancetta are not pork, nor one another;
//   - a liver, a kidney, fat, rinds, a salad, a soup, nuggets, gravy, corned beef, beef tomatoes and
//     oyster mushrooms are not the animal (or the shellfish) in their name;
//   - a chilli jam, a paste, flakes and pickled scallions are not the chile or the scallion;
//   - a roma tomato is a plum tomato, not a cherry, grape or vine one;
//   - goat cheese is not a goat.
const GONE_ON_PURPOSE_MADE_FROM_ANIMALS = [
  ["saucisse italienne", "pork loin"],
  ["saucisses italiennes", "pork rinds"],
  ["sausage", "pork"],
  ["ham", "raw pork chops"],
  ["jambon", "côtelette de porc"],
  ["natural bacon", "pork loin"],
  ["bacon", "pork belly slices"],
  ["pork loin", "prosciutto"],
  ["chorizo", "ham"],
  ["bacon", "sausage"],
  ["canard", "duck fat"],
  ["duck fat", "canard"],
  ["crevette", "shrimp salad"],
  ["shrimp salad", "crevette"],
  ["chicken", "Chicken Liver"],
  ["Chicken salad", "poulet"],
  ["poulet", "chicken nuggets"],
  ["boeuf", "corned beef"],
  ["Beef tomatoes", "beef"],
  ["boeuf", "Beef Gravy"],
  ["agneau", "Lamb Kidney"],
  ["Oyster Mushrooms", "oyster"],
  ["chili", "Thai Chilli Jam"],
  ["piment fort", "Pâte de piment fort"],
  ["Chilli Flakes", "Chilli"],
  ["piment fort", "Chilli Flakes"],
  ["Pickled Scallion Heads", "green onion"],
  ["cherry tomato", "roma tomato"],
  ["tomate cerise", "tomate roma"],
  ["Vine Tomatoes", "roma tomato"],
  ["goat", "goat cheese"],
  ["fromage de chèvre", "goat"],
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

// Matches that went away on purpose when dried and smoked became foods of their own (the lost matches are
// grouped and explained in the pull request): a dried food is not the fresh one and a smoked food is not
// the plain one, in both directions and both languages, a few of each kind here.
//   - dried fruit, vegetables, fish and mushrooms are not the fresh (or frozen) food;
//   - dried beans and chickpeas are not the bare name, which could be a can;
//   - dry mustard powder is not the jar of mustard;
//   - smoked salmon, turkey and tofu are not the plain food;
//   - a bare "smoked", « fumé », « déshydraté » or "sun dried" (FoodKeeper keywords) is not a food;
//   - herbs, spices and the foods only sold dry keep their plain name (rows in inventoryMatchRules.test.js).
const GONE_ON_PURPOSE_DRIED_AND_SMOKED = [
  ["apricot", "dried apricots"],
  ["dried apricots", "apricot"],
  ["abricot", "abricots séchés"],
  ["abricots séchés", "abricot"],
  ["abricot", "dried apricots"],
  ["Baby Plum Tomatoes", "dried tomatoes"],
  ["dried tomatoes", "Baby Plum Tomatoes"],
  ["tomate", "tomates séchées"],
  ["tomates séchées", "tomate"],
  ["Baby Plum Tomatoes", "tomates séchées"],
  ["cranberries", "dried cranberries"],
  ["dried cranberries", "cranberries"],
  ["canneberge", "canneberges séchées"],
  ["canneberges séchées", "canneberge"],
  ["cherries", "Dried Cherries"],
  ["Dried Cherries", "cherries"],
  ["cerise", "Dried Cherries"],
  ["mango", "dried mango"],
  ["dried mango", "mango"],
  ["mangue", "mangue séchée"],
  ["mangue séchée", "mangue"],
  ["fruit", "Dried Fruit"],
  ["Dried Fruit", "fruit"],
  ["mushroom", "dried mushrooms"],
  ["dried mushrooms", "mushroom"],
  ["champignon", "champignons séchés"],
  ["champignons séchés", "champignon"],
  ["Jumbo Shrimp", "dried shrimp"],
  ["dried shrimp", "Jumbo Shrimp"],
  ["crevette", "crevettes séchées"],
  ["crevettes séchées", "crevette"],
  ["corn", "Dried white corn"],
  ["Dried white corn", "corn"],
  ["Dried white corn", "mais"],
  ["bean", "dried white beans"],
  ["dried white beans", "bean"],
  ["dried white beans", "haricot"],
  ["chickpea", "dried chickpeas"],
  ["dried chickpeas", "chickpea"],
  ["pois chiche", "pois chiches séchés"],
  ["pois chiches séchés", "pois chiche"],
  ["dried mustard", "moutarde"],
  ["salmon", "cold smoked salmon"],
  ["cold smoked salmon", "salmon"],
  ["filet de saumon", "saumon fumé"],
  ["saumon fumé", "filet de saumon"],
  ["cold smoked salmon", "filet de saumon"],
  ["dindon", "Smoked Turkey Neck"],
  ["Smoked Turkey Neck", "dindon"],
  ["dinde", "Smoked Turkey Neck"],
  ["firm tofu", "smoked tofu"],
  ["smoked tofu", "firm tofu"],
  ["commercially", "commercially dried"],
  ["commercially dried", "commercially"],
  ["split", "dried split"],
  ["dried split", "split"],
  ["sun", "sun dried"],
  ["sun dried", "sun"],
  ["sun dried", "sun dried"],
  ["smoked", "smoked"],
  ["smoked", "fume"],
  ["fume", "fume"],
  ["fumee", "fumes"],
  ["deshydrate", "deshydrates"],
  ["lyophilise", "lyophilise"],
];

describe("the wide check over real names", () => {
  it("lists a few thousand names and what they covered", () => {
    expect(names.length).toBeGreaterThan(3000);
    expect(baseline).toHaveLength(names.length);
    expect(baseline.reduce((n, row) => n + row.length, 0)).toBeGreaterThan(20000);
  });

  it("still covers every name it covered", () => {
    const lost = [];
    baseline.forEach((row, i) => {
      for (const j of row) if (!itemCovers(names[i], names[j])) lost.push(`${names[i]} -> ${names[j]}`);
    });
    expect(lost).toEqual([]);
  });

  it.each([...GONE_ON_PURPOSE, ...GONE_ON_PURPOSE_FRENCH_AND_EGGS, ...GONE_ON_PURPOSE_MADE_FROM_ANIMALS, ...GONE_ON_PURPOSE_DRIED_AND_SMOKED])("%s does not cover %s, as it should not", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(false);
  });
});

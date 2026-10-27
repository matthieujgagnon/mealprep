import { canonicalize, canonicalUnit, capitalize, singularize } from "./ingredientNames.js";
import { buildFrenchReading } from "./frenchReading.js";
import { describingCells, effectiveIngredientRows, ingredientListVersion } from "./ingredientList.js";
import { fold } from "./ingredientTable.js";
import { animalWord, cutFamily, familyKey, synonymOf } from "./ingredientFamilies.js";
import { convertToUnit } from "./units.js";
import { daysUntil } from "./pantryInventory.js";
import { isMealItem, isPreparedMeal } from "./mealItem.js";
import { isPreparedRecipe } from "./mealSlots.js";
import { findLink, linkKey, linksOnItemName, linksVersion } from "./inventoryLinks.js";

// Which Inventory item a recipe ingredient is, and how much of it a cooked
// meal takes out. The one matching in the app: every page that says whether you
// have an ingredient uses it (the recipe card, Makeable, the recipe pop-out, the
// Planner's search and meal card, Home, Recipes, the recipe form's preview), and
// so do the finished view's "Take out of your Inventory" list, "uses expiring"
// and Cook with, so they always agree.
//
// Two names are the same food when, once both are read in English:
//   - French names count: « Poulet », « Lait 2 % », « ail », « oignons », « banane »,
//     « pommes de terre ». The French comes from ONE place, the table of ingredient names
//     (ingredientDisplay.txt, with Matt's changes from the Admin page on top of it, read
//     through lib/ingredientList.js): every French spelling of a row, singular and plural, is
//     read as the row's first English name (lib/frenchReading.js), and it follows an edit at
//     once. The matcher's own few words (« haché », « bouillon », « zeste », the cuts of a meat)
//     are lib/matcherWords.js. Only French is read from the table, never a row's other
//     English spellings ("ground coriander" must stay apart from cilantro);
//   - the food words are the same, in any order (« fromage cheddar » is "cheddar
//     cheese"), with prep words, plurals, "whole", "2%", "unsalted", "boneless"
//     and the like left out;
//   - a colour or a variety ("yellow", "basmati", "greek", "roma") only tells two
//     foods apart when both names give one: "onion" covers "yellow onion", but red
//     and yellow onions are not the same;
//   - a cut works the same way: plain "chicken" covers thighs, but chicken breasts
//     don't cover chicken thighs;
//   - a stock, broth, powder, paste, sauce or juice is never the food it is made
//     of: « bouillon de poulet » is not chicken, garlic powder is not garlic;
//   - plain pepper is the spice; a bell pepper or a coloured pepper ("red
//     pepper") is the vegetable, and the two never match;
//   - several foods written on one line ("salt and pepper", « sel et poivre, au
//     goût ») are looked up one by one: the line is had when each is;
//   - water from the tap is never something to buy;
//   - words that only describe ("low sodium", "reduced fat", "liquid", "unwaxed",
//     "bulb") are left out, in both languages, and a style word that names its own
//     product ("balsamic", "dijon", "sriracha", "miso") is that product with or
//     without it ("balsamic" is "balsamic vinegar", but plain vinegar is not);
//   - a few names are one food written two ways (SYNONYMS: "rice wine vinegar" is
//     "rice vinegar", in any word order and in French), a few cover one way only
//     (ALSO_COVERS: seasoned rice vinegar is rice vinegar, not the other way round);
//   - a whole lime or lemon covers its juice and zest, an orange its zest; bottled
//     juice never covers the fruit (FRUIT_PARTS);
//   - dried and smoked are foods of their own, in both directions and both languages ("dried apricots" are
//     not apricots, smoked salmon is not salmon; STATE_WORDS): "dehydrated", "sun-dried", « séchées »,
//     « déshydratées », « fumées »... are the same state. "dried" says nothing about a herb, a spice or a
//     food only sold dry (DRIED_IS_PLAIN: "dried oregano" is oregano, "dried spaghetti" is spaghetti), nor
//     about a ground spice, and "smoked" says nothing about paprika; "cooked", "raw", "fresh" and "frozen"
//     are still left out;
//   - mustard powder is one food however it is written ("dry mustard", "dried ground mustard", "mustard
//     powder", « moutarde sèche », « moutarde en poudre », « moutarde moulue ») and never prepared mustard
//     (isMustardPowder);
//   - an egg covers its yolk and its white, never the other way round (an egg is not "egg
//     yolk" in a recipe; a yolk is not an egg);
//   - a meat made into something else is a food of its own: a sausage, bacon or ham is never a pork
//     chop, and a liver, "duck fat", "shrimp salad", "beef tomatoes" or "corned beef" is not the
//     animal in its name (MADE_MEATS, NOT_THE_ANIMAL); a synonym is swapped word by word, so a
//     "chilli jam" is not a chile; a roma tomato is a plum tomato, not a cherry one; goat cheese
//     is not a goat; "ripe" says nothing about which food it is ("ripe bananas", « bananes mûres »),
//     while « mûres » on its own is blackberries;
//   - coriander on its own is cilantro, while ground coriander and coriander seeds
//     are the spice;
//   - lime, banana, grape, vine and curry leaves are products of their own, never
//     the fruit or the plant, while every other leaf is its herb ("basil leaves");
//   - and last, a name Matt taught (« Je l'ai comme… », lib/inventoryLinks.js): a recipe
//     that says "rice vinegar" counts as had when he has "Rice wine vinegar" there, for
//     exactly those two names, one way and one hop. This file is the only place that
//     reads those links to decide whether a name counts.
// Nothing else decides whether you have an ingredient: salt, oil and spices are
// ingredients like any other, had when they are in Inventory.
// A meal is not an ingredient and never matches (`isMealItem`, lib/mealItem.js): a
// leftover, or a prepared meal the person tagged (a frozen "Chicken, Broccoli and
// Cheddar Puff Pastry" is never chicken, broccoli or cheddar).
// The one exception is the other way round: a recipe that is « Plat préparé » (croissants, a
// frozen lasagna: nothing to cook) is had by a prepared meal in Inventory with the same
// name, by these same rules, and by nothing else (not an ingredient, not a leftover); and
// its ingredients are not looked for among the ingredients. `{ prepared: true }` on the
// functions below is that; the ones that take a recipe read the recipe's own flag.

// "the" is English as often as it is « thé », so it is never read as tea here.
const LITTLE = new Set("a an and or of the to in for with on at de du des la le les l d un une au aux et ou en pour avec sur sans".split(" "));

// What the matcher understands in French, built from the table of ingredient names (Matt's changes
// included) and its few own words. Built again, with everything worked out from the old one
// forgotten, whenever the table changes.
const profileCache = new Map();
const lineFoods = new Map();
let frenchReading = null;
let frenchReadingVersion = -1;

// The French the matcher would understand from a list of rows (the Admin form tries a draft row
// this way, before it is saved).
export const readingFor = (rows) => buildFrenchReading(rows, describingCells(), LITTLE);

function currentReading() {
  const version = ingredientListVersion();
  if (!frenchReading || version !== frenchReadingVersion) {
    frenchReading = readingFor(effectiveIngredientRows());
    frenchReadingVersion = version;
    profileCache.clear();
    lineFoods.clear();
  }
  return frenchReading;
}

// Words that say how a food is made or sold, never which food it is, written as
// they arrive (two words, or hyphenated), in English and in Quebec French (the
// feminine forms too, accents folded). They go before anything else is read.
const DESCRIBING = [
  "low sodium", "reduced sodium", "low fat", "reduced fat", "fat free", "no salt added", "full fat", "liquid", "unwaxed",
  "faible en sodium", "faible teneur en sodium", "a faible teneur en sodium", "reduit en sodium", "reduite en sodium",
  "teneur reduite en sodium", "a teneur reduite en sodium", "faible en gras", "faible teneur en gras", "a faible teneur en gras",
  "reduit en gras", "reduite en gras", "teneur reduite en gras", "a teneur reduite en gras", "sans gras", "sans sel ajoute",
  "sans sel ajoutee", "liquide", "non cire", "non ciree", "non cires", "non cirees",
].sort((a, b) => b.length - a.length);
const DESCRIBING_RE = new RegExp(`(?<![a-z])(${DESCRIBING.map((phrase) => phrase.replace(/ /g, "[- ]+")).join("|")})(?![a-z])`, "g");

// How a food was kept: dried and smoked are different products you buy differently, so they tell two
// foods apart ("dried apricots" are not apricots, smoked salmon is not salmon), in both directions and
// in both languages. Every way of writing them is read as one of the two states: "dehydrated",
// "sun-dried", "freeze-dried", « séchées », « séchées au soleil », « déshydratées », « lyophilisées »
// are dried, "hickory-smoked" and « fumée » are smoked. ("dry" and « sec » are not here: a dry wine
// or a dry-roasted nut is not a dried food; "cooked", "raw", "fresh" and "frozen" stay describing
// words.) The state words are taken out of a name before the food is read, and the profile keeps them.
const STATE_WORDS = new Map([["dried", "dried"], ["dehydrated", "dried"], ["sundried", "dried"], ["smoked", "smoked"]]);
const DRIED_PHRASE_RE = /(?<![a-z])(?:(?:sun|freeze|air|oven)[- ]+dried|sech[a-z]*[- ]+au[- ]+soleil)(?![a-z])/g;
const SMOKED_COMPOUND_RE = /(?<![a-z])[a-z]+-smoked(?![a-z])/g;
// Foods that "dried" says nothing about, because that is how they are sold: the jar of oregano on the
// spice rack is dried oregano, and a box of spaghetti or lentils is dry. (Beans and chickpeas are not
// here: the bare name could be a can.) Written as the matcher reads the food.
const DRIED_IS_PLAIN = new Set([
  // Herbs.
  "oregano", "thyme", "basil", "parsley", "dill", "mint", "rosemary", "sage", "chive", "tarragon", "bay", "marjoram", "savory", "cilantro",
  "coriander", "fenugreek", "lemongrass", "herb",
  // Spices and chili flakes.
  "chiliflake", "paprika", "cumin", "turmeric", "cinnamon", "nutmeg", "cardamom", "saffron", "allspice", "cayenne pepper",
  // Only ever sold dry.
  "pasta", "spaghetti", "penne", "macaroni", "fusilli", "linguine", "fettuccine", "rigatoni", "farfalle", "orzo", "vermicelli", "lasagna",
  "noodle", "egg noodle", "noodle rice", "lasagna noodle", "lentil", "pea split",
]);
// Smoked paprika is the paprika in the spice rack, as it always was (Cook with's "Paprika" finds it).
const SMOKED_IS_PLAIN = new Set(["paprika"]);
const STATE_IS_PLAIN = { dried: DRIED_IS_PLAIN, smoked: SMOKED_IS_PLAIN };

// The state words in an English reading, and the rest of the name.
function takeState(english) {
  const states = new Set();
  const rest = english.split(" ").filter((w) => {
    const state = STATE_WORDS.get(w);
    if (state) states.add(state);
    return !state;
  });
  return { rest: rest.join(" "), states };
}

// Mustard powder, the spice in the spice rack, is written many ways: "dry mustard", "dried mustard",
// "ground mustard", "dried ground mustard", "mustard powder", « moutarde sèche », « moutarde en poudre »,
// « moutarde moulue ». They are all one food, a powder, and none of them is prepared mustard (Dijon,
// yellow) or the other way round: a name that is mustard and says it is dry or ground is read as
// "mustard powder", which the matcher already keeps apart from the plain food.
const MUSTARD_POWDER_WORDS = new Set("dry ground powder powdered moulu moulue moulus moulues poudre".split(" "));
function isMustardPowder(rest, states) {
  const words = rest.split(" ").filter((w) => w && !LITTLE.has(w));
  const others = words.filter((w) => !MUSTARD_POWDER_WORDS.has(w));
  return others.length === 1 && others[0] === "mustard" && (states.has("dried") || words.length > 1);
}

// "dried", "smoked", "dried+smoked" or "": the states that tell this food apart from its plain self.
const stateOf = (food, states) =>
  [...states].filter((state) => !STATE_IS_PLAIN[state].has(food)).sort().join("+");

// The leaves that are a product of their own: "lime leaves" is not lime, "grape
// leaves" are not grapes. Every other leaf is its herb ("basil leaves", "bay
// leaves"), which canonicalize leaves out. Joined into one word before that.
const OWN_LEAF_RE = /(?<![a-z])(?:(?:kaffir|makrut) )?(lime|banana|grape|vine|curry)s?[- ]+(?:leaf|leaves)(?![a-z])/g;
const OWN_LEAF_FR_RE = /(?<![a-z])(?:leaf|leaves) (?:(?:kaffir|makrut) )?(lime|banana|grape|vine|curry)s?(?![a-z])/g;

// A name in (mostly) English words: French phrases and words are swapped for
// their English, anything unknown is kept as written.
function toEnglish(name, reading) {
  const { words, phraseRe, phraseMap, also = new Map() } = reading;
  let text = fold(String(name || "").replace(/\([^)]*\)/g, " "))
    .replace(/['’]/g, " ")
    .replace(DESCRIBING_RE, " ")
    .replace(DRIED_PHRASE_RE, " dried ")
    .replace(SMOKED_COMPOUND_RE, " smoked ");
  if (phraseRe) text = text.replace(phraseRe, (m) => ` ${phraseMap.get(m.replace(/[- ]/g, "")) || m} `);
  const tokens = text
    .replace(/\b(\d+)\s*%/g, " ")
    .split(/[^a-z0-9-]+/)
    .filter(Boolean);
  return tokens
    .map((w, i) => {
      if (LITTLE.has(w) || /^\d/.test(w)) return null;
      // « mûres » is blackberries, and the feminine of « mûr », ripe: it is the fruit on its own or
      // after « de », « aux », « et » or a number (« confiture de mûres »), and it only says ripe
      // after another word (« cerises mûres »), which is then left out like any describing word.
      const before = tokens[i - 1];
      if (also.has(w) && before && !LITTLE.has(before) && !/^\d/.test(before)) return also.get(w);
      return words.get(w) || words.get(w.replace(/[sx]$/, "")) || w;
    })
    .filter(Boolean)
    .join(" ")
    .replace(OWN_LEAF_RE, "$1leaf")
    .replace(OWN_LEAF_FR_RE, "$1leaf");
}

// Words that say how a food is sold or kept, never which food it is.
const DESCRIPTORS = new Set(
  (
    "whole skim nonfat fat-free low-fat reduced-fat unsalted salted boneless skinless bone-in skin-on lean extra-lean extra-virgin virgin " +
    "organic bio plain natural regular low-sodium sodium-free no-salt-added light homemade store-bought mild moulu moulue moulus moulues all-purpose pure granulated bulb ripe"
  ).split(" ")
);
// What a food was made into: not the food itself.
const DERIVED = { broth: "stock", stock: "stock", bouillon: "stock", consomme: "stock", base: "stock", powder: "powder", paste: "paste", sauce: "sauce", juice: "juice", extract: "extract", zest: "zest", puree: "puree", seasoning: "seasoning", dressing: "dressing", syrup: "syrup" };
// Cuts of meat and fish.
const CUTS = new Set(
  "breast thigh leg drumstick wing fillet tenderloin loin chop rib roast steak ground shoulder belly shank brisket sirloin flank cutlet strip mince minced".split(" ")
);
// Colours and varieties: they only separate two foods when both names give one.
const KINDS = new Set(
  "red yellow white green black brown purple golden basmati jasmine arborio sushi greek roma cherry grape plum yukon russet gold baby english field vine heirloom haas hass california sweet vidalia spanish italian flat-leaf curly savoy napa cortland mcintosh gala honeycrisp".split(" ")
);
// Two-word foods a colour or variety word belongs to.
const COMPOUNDS = [
  ["green onion", "scallion"], ["spring onion", "scallion"], ["green bean", "greenbean"], ["black bean", "blackbean"], ["kidney bean", "kidneybean"],
  ["sweet potato", "sweetpotato"], ["red pepper flake", "chiliflake"], ["sour cream", "sourcream"], ["cream cheese", "creamcheese"], ["ice cream", "icecream"],
  ["coconut milk", "coconutmilk"], ["peanut butter", "peanutbutter"], ["maple syrup", "maplesyrup"],
  ["crushed red pepper", "chiliflake"], ["chili flake", "chiliflake"], ["chilli flake", "chiliflake"], ["chile flake", "chiliflake"], ["corn starch", "cornstarch"],
  // "cheese" is left out of a name ("pita bread" is pita, "cheddar cheese" is cheddar), so goat cheese would be the goat.
  ["goat cheese", "goatcheese"],
];
// Names that are one food written two ways, said once here.
const SAME_FOOD = { "cooking oil": "vegetable oil", "canola oil": "vegetable oil" };
// The colours that make "pepper" the vegetable.
const PEPPER_COLOURS = new Set(["red", "yellow", "green", "purple"]);
// Words that can sit beside "water" and leave it water from the tap.
const TAP_WATER_WORDS = new Set("water cold warm hot boiling lukewarm ice iced tap filtered cool room-temperature".split(" "));
// Words that only say what kind of thing it is ("pita bread" is pita).
const GENERIC = new Set(["bread", "cheese"]);
// A name with an animal in it is that animal ("rotisserie chicken", "pork shoulder steaks") unless it
// is made into something else. Bacon, ham and sausage are a food of their own, whatever animal they
// come from (the animal only tells two of them apart, like a colour): a sausage is never a pork chop.
const MADE_MEATS = new Set("bacon ham prosciutto pancetta sausage chorizo".split(" "));
// These next to an animal make another food, not the animal: "chicken liver", "duck fat",
// "shrimp salad", "pork rinds", "beef tomatoes", "oyster mushrooms", "corned beef".
const NOT_THE_ANIMAL = new Set(
  "liver kidney fat rind nugget patty burger meatball salad soup curry gravy bowl pie sandwich mushroom tomato corned".split(" ")
);
// Varieties that canonicalize leaves out but that tell two foods apart, and the kind each one is
// ("roma" is a plum tomato, so it is not a cherry or a grape tomato). Hass and California avocados
// are the same fruit, so those stay left out.
const VARIETY_KINDS = new Map([["roma", "plum"]]);
// Style words that never name another food, with the product they imply: "balsamic"
// alone is "balsamic vinegar" and "sriracha" is "sriracha sauce". Plain "vinegar" is
// not balsamic, so these stay part of the food; only the product word is filled in.
const STYLE_WORDS = {
  balsamic: "vinegar", dijon: "mustard", sriracha: "sauce", hoisin: "sauce", worcestershire: "sauce", tabasco: "sauce",
  teriyaki: "sauce", tahini: "paste", miso: "paste", gochujang: "paste", harissa: "paste",
};
// Names that are one food written two ways, whatever the word order or the language:
// the words on the left, all there, become the words on the right.
const SYNONYMS = [
  ["rice wine vinegar", "rice vinegar"],
  ["apple cider vinegar", "cider vinegar"],
  ["red vinegar", "red wine vinegar"],
].map(([from, to]) => [from.split(" "), to.split(" ")]);
// What an item named on the left also covers when a recipe names the one on the right,
// and not the other way round.
const ALSO_COVERS = [["seasoned rice vinegar", "rice vinegar"]];
// The parts of a fruit that a whole one covers (bottled juice never covers the fruit).
const FRUIT_PARTS = { lime: ["juice", "zest"], lemon: ["juice", "zest"], orange: ["zest"] };

// The parts of a whole food that it covers, one way only: an egg covers a recipe's "egg yolk" and
// "egg white", but a yolk or a white never covers an egg. A part is only read on a name that is
// the food and the part and nothing else ("white egg noodles" stays egg noodles).
const FOOD_PARTS = { egg: ["yolk", "white"] };

// Everything the matching needs to know about one name, read with the French in `reading`
// (frenchReading.js: the table, Matt's changes and the matcher's own words).
function buildProfile(key, reading) {
  const taken = takeState(toEnglish(key, reading));
  const { states } = taken;
  let { rest } = taken;
  if (isMustardPowder(rest, states)) {
    rest = "mustard powder";
    states.delete("dried");
  }
  const { core: written, varieties } = canonicalize(rest);
  let core = written;
  const words0 = core.split(" ").filter((w) => w && !DESCRIPTORS.has(w) && !LITTLE.has(w));
  core = words0.join(" ");
  core = SAME_FOOD[core] || core;
  let joined = ` ${core} `;
  for (const [phrase, token] of COMPOUNDS) joined = joined.replace(` ${phrase} `, ` ${token} `);
  let words = joined.trim().split(" ").filter(Boolean);
  words.push(...varieties.filter((v) => VARIETY_KINDS.has(v)).map((v) => VARIETY_KINDS.get(v)));
  for (const [from, to] of SYNONYMS) {
    if (from.every((w) => words.includes(w))) words = [...new Set([...words.filter((w) => !from.includes(w)), ...to])];
  }
  // A style word on its own names its product: "miso" is "miso paste".
  const styled = words.filter((w) => !KINDS.has(w));
  if (styled.length === 1 && STYLE_WORDS[styled[0]]) words = [...words, STYLE_WORDS[styled[0]]];

  // "dried ground mustard" is ground mustard: a ground spice is dry already.
  if (words.includes("ground")) states.delete("dried");

  // "egg yolk", "egg whites": the egg and the part of it ("white" is a colour everywhere else).
  let part = null;
  for (const [whole, parts] of Object.entries(FOOD_PARTS)) {
    const found = parts.find((w) => words.includes(w));
    if (found && words.includes(whole) && words.every((w) => w === whole || w === found)) {
      part = found;
      words = words.filter((w) => w !== found);
    }
  }

  let derived = null;
  const cuts = new Set();
  const kinds = new Set();
  let base = [];
  for (const w of words) {
    if (DERIVED[w]) derived = DERIVED[w];
    else if (CUTS.has(w)) cuts.add(w === "minced" || w === "mince" ? "ground" : w);
    else if (KINDS.has(w)) kinds.add(w);
    else base.push(w);
  }
  // "cherry" alone is the fruit, "greek" alone is still a word: keep a kind word
  // when it is all there is.
  if (base.length === 0 && kinds.size > 0 && cuts.size === 0) {
    base = [...kinds];
    kinds.clear();
  }
  // Plain pepper is the spice; a coloured pepper is the vegetable ("bell" stays in
  // a bell pepper's name, so that one is never the spice).
  if (base.length === 1 && base[0] === "pepper" && [...kinds].some((k) => PEPPER_COLOURS.has(k))) base = ["bell", "pepper"];
  // "orange" is a fruit first, so an orange pepper is told by its two words: it is a bell pepper.
  if (base.length === 2 && base.includes("orange") && base.includes("pepper")) base = ["orange", "bell", "pepper"];
  if (base.length > 1) base = base.filter((w) => !GENERIC.has(w));
  // A cut on its own ("flank steak", "sirloin") is still a meat.
  if (base.length === 0) {
    const fam = familyKey(words.join(" "));
    base = fam && fam !== words.join(" ") ? [fam] : [...cuts].map((c) => familyKey(c));
  }
  // A sausage, bacon or ham is its own food, and pork is what it is made of unless the name says
  // another animal ("pork sausage" is a sausage, "turkey bacon" is not bacon). Any other word keeps
  // it apart too ("bacon grease", "bacon bits").
  if (base.some((w) => MADE_MEATS.has(w))) base = base.filter((w) => w !== "pork");

  const food = foodOf(base);
  return { core, food, derived, part, cuts, kinds, state: stateOf(food, states) };
}

// The food a name is, once its words are sorted out. Chicken is chicken whatever else the name says
// ("rotisserie chicken"), except when it is made into something else; a synonym is swapped word by
// word ("chilli" is "chile", so "chilli jam" is a chile jam and not a chile).
function foodOf(base) {
  const whole = base.join(" ");
  if (base.some((w) => MADE_MEATS.has(w))) return [...base].sort().join(" ");
  const exact = cutFamily(whole) || synonymOf(whole);
  if (exact) return exact;
  if (!base.some((w) => NOT_THE_ANIMAL.has(w))) {
    const animal = base.find(animalWord);
    if (animal) return animal;
  }
  const words = base.map((w) => synonymOf(w) || w);
  // A chile is a chile pepper, hot or not ("chili", "chili pepper" and "hot chilies"), while a chile
  // jam, a chili con carne or a chili bean paste are other foods.
  return (words.includes("chile") ? words.filter((w) => w !== "pepper" && w !== "hot") : words).sort().join(" ");
}

// Everything the matching needs to know about one name.
export function foodProfile(name) {
  const key = String(name || "");
  const reading = currentReading();
  if (!profileCache.has(key)) profileCache.set(key, buildProfile(key, reading));
  return profileCache.get(key);
}

// The same, read with another reading (a table with a draft row in it): for the Admin form's
// checks. Nothing is kept.
export const foodProfileUnder = (reading, name) => buildProfile(String(name || ""), reading);

// How a name reads in English under `reading`, before the rules look at it.
export const englishUnder = (reading, name) => toEnglish(name, reading);

// Two profiles are the same food under the matcher's rules.
export const sameProfiles = (a, b) => sameProfile(a, b);

const overlaps = (a, b) => a.size === 0 || b.size === 0 || [...a].some((x) => b.has(x));

// The foods written on one ingredient line: the line itself, or its parts when it
// names several ("salt and pepper", « sel et poivre, au goût »). A part that is
// only a note ("to taste", "minced") is not a food.
export function foodsOnLine(name) {
  const key = String(name || "").trim();
  currentReading(); // forgets the lines worked out with an older table
  if (!lineFoods.has(key)) {
    const parts = key.split(/\s*(?:,|&|\band\b|\bet\b)\s*/i).filter((part) => foodProfile(part).core);
    lineFoods.set(key, parts.length > 1 ? parts : [key]);
  }
  return lineFoods.get(key);
}

// Water from the tap ("water", "cold water", « eau froide »): never to buy.
export function isTapWater(name) {
  const words = foodProfile(name).core.split(" ").filter(Boolean);
  return words.includes("water") && words.every((w) => TAP_WATER_WORDS.has(w));
}

// Two names that are the same food, once both are read.
function sameProfile(have, want) {
  if (!have.food || !want.food) return false;
  if (have.derived !== want.derived) return false;
  if (have.part !== want.part) return false;
  if (have.state !== want.state) return false;
  if (have.food !== want.food) return false;
  return overlaps(have.cuts, want.cuts) && overlaps(have.kinds, want.kinds);
}

// Coriander written on its own (no "ground", no "seeds") is the herb, cilantro.
const isBareCoriander = (p) => p.food === "coriander" && !p.derived && p.cuts.size === 0 && p.kinds.size === 0;
const isCilantro = (p) => p.food === "cilantro" && !p.derived && p.cuts.size === 0 && p.kinds.size === 0;

// The rules that make two differently written names one food, after sameProfile.
function coveredAnotherWay(have, want) {
  // A dried lime is not a fresh lime's juice, and a smoked food is not a plain one.
  if (have.state !== want.state) return false;
  if ((isBareCoriander(have) && isCilantro(want)) || (isCilantro(have) && isBareCoriander(want))) return true;
  // A whole fruit covers its juice and its zest.
  if (!have.derived && have.food === want.food && FRUIT_PARTS[have.food]?.includes(want.derived)) return true;
  // A whole egg covers its yolk and its white (and a yolk or a white never covers an egg).
  if (!have.part && !have.derived && have.food === want.food && FOOD_PARTS[have.food]?.includes(want.part)) return true;
  return ALSO_COVERS.some(([from, to]) => sameProfile(have, foodProfile(from)) && sameProfile(foodProfile(to), want));
}

// The matcher's own rules: the two names are the same food.
function rulesCover(haveName, foodName) {
  const have = foodProfile(haveName);
  const want = foodProfile(foodName);
  if (!have.food || !want.food) return false;
  return sameProfile(have, want) || coveredAnotherWay(have, want);
}

// The rules, then what Matt taught (the one place a link is read to decide a match).
function sameFoodAs(haveName, foodName) {
  return rulesCover(haveName, foodName) || Boolean(findLink(haveName, foodName));
}

// Whether something you have (an Inventory item) is this recipe ingredient, or
// one of the foods on its line.
export function itemCovers(haveName, ingredientName) {
  return foodsOnLine(ingredientName).some((food) => sameFoodAs(haveName, food));
}

const isUsable = (item) => !isMealItem(item);
const notExpired = (item) => !item.expiresAt || daysUntil(item.expiresAt) >= 0;
// What can be had: the ingredients (not meals), or, for a prepared recipe, the prepared meals.
const poolOf = (prepared) => (prepared ? isPreparedMeal : isUsable);

// The Inventory items that are this ingredient, the one to use first first:
// still good before past its date, then the soonest use-by date, then the oldest.
export function matchingItems(ingredientName, inventory = [], { prepared = false } = {}) {
  const time = (d) => (d ? new Date(d).getTime() : Infinity);
  const inPool = poolOf(prepared);
  return inventory
    .filter((item) => inPool(item) && itemCovers(item.name, ingredientName))
    .sort(
      (a, b) =>
        Number(notExpired(b)) - Number(notExpired(a)) ||
        time(a.expiresAt) - time(b.expiresAt) ||
        time(a.purchasedAt || a.createdAt) - time(b.purchasedAt || b.createdAt)
    );
}

// The first item still good that is this ingredient: what the blue ✓ shows.
export function haveItemFor(ingredientName, inventory = [], options) {
  return matchingItems(ingredientName, inventory, options).find(notExpired) || null;
}

// ---- What Matt taught (« Je l'ai comme… ») ----------------------------------------

// The foods a link is taught for when a recipe's ingredients are not in Inventory: for
// each ingredient name the first food on its line that no Inventory item is yet
// ("salt and pepper" with salt in Inventory is "pepper"), each food once. None when
// everything is already had or is water from the tap.
export function foodsToTeach(names, inventory = []) {
  const foods = [];
  for (const name of [].concat(names)) {
    const food = foodsOnLine(name).find((f) => !isTapWater(f) && !haveItemFor(f, inventory));
    if (food && !foods.some((other) => linkKey(other) === linkKey(food))) foods.push(food);
  }
  return foods;
}

// The link that makes this line count, and the Inventory item it points at, when the
// line is had only because Matt said so: none of the matcher's own rules cover that
// food. `names` are the ingredient names the line is made of ("garlic", "garlic
// cloves"). null when no link is behind it.
export function linkBehind(names, inventory = []) {
  const items = inventory.filter((item) => isUsable(item) && notExpired(item));
  for (const name of [].concat(names)) {
    for (const food of foodsOnLine(name)) {
      if (items.some((item) => rulesCover(item.name, food))) continue;
      for (const item of items) {
        const link = findLink(item.name, food);
        if (link) return { link, item };
      }
    }
  }
  return null;
}

// What an Inventory item also counts as, because Matt said so: the links whose
// Inventory side is this item's name (the item pop-up's "Also counts as").
export function linksFromItem(item) {
  return isUsable(item) ? linksOnItemName(item.name) : [];
}

// ---- A recipe next to your Inventory -------------------------------------------
//
// `kitchen` is what App.jsx keeps once: { inventory }.

const NO_ITEMS = [];
// The answers for one Inventory, kept until it or the day change.
const answers = new WeakMap();

function answersFor(kitchen) {
  const inventory = kitchen?.inventory || NO_ITEMS;
  const day = new Date().toDateString();
  const links = linksVersion();
  const names = ingredientListVersion();
  let table = answers.get(inventory);
  if (!table || table.day !== day || table.links !== links || table.names !== names) {
    table = { day, links, names, byName: new Map() };
    answers.set(inventory, table);
  }
  return table;
}

// Whether you have an ingredient: every food on its line is water from the tap or
// an Inventory item still good.
function lineHave(name, inventory, options) {
  return foodsOnLine(name).every((food) => isTapWater(food) || haveItemFor(food, inventory, options));
}

// Where one ingredient stands: "have" (Inventory holds it, still good) or "need".
// What the recipe card's ✓ beside each ingredient shows. `prepared`: the ingredient is a
// prepared recipe's, had by a prepared meal of that name.
export function ingredientHave(name, kitchen, { prepared = false } = {}) {
  const table = answersFor(kitchen);
  const key = prepared ? `prepared:${name}` : name;
  if (!table.byName.has(key)) table.byName.set(key, lineHave(name, kitchen?.inventory || NO_ITEMS, { prepared }) ? "have" : "need");
  return table.byName.get(key);
}

// Two ingredients of one recipe are the same food when each covers the other:
// "garlic cloves" and "minced garlic" are, chicken thighs and chicken breasts are not.
function sameFood(a, b) {
  if (itemCovers(a, b) && itemCovers(b, a)) return true;
  return !foodProfile(a).food && !foodProfile(b).food && fold(a).trim() === fold(b).trim();
}

// The lines behind recipeHave, with the ingredients in each: one line per food,
// in the recipe's order, named as the recipe first writes it (a missing line, as
// it writes the missing ingredient). Water from the tap is not a line.
//   [{ key, name, had, ingredients }]
export function recipeLines(recipe, kitchen) {
  const lines = [];
  const prepared = isPreparedRecipe(recipe);
  for (const ing of recipe?.ingredients || []) {
    const name = String(ing?.name || "").trim();
    if (!name || isTapWater(name)) continue;
    const status = ingredientHave(name, kitchen, { prepared });
    const line = lines.find((l) => sameFood(l.written, name));
    if (!line) lines.push({ written: name, had: status === "have", missingName: status === "have" ? null : name, ingredients: [ing] });
    else {
      line.ingredients.push(ing);
      if (status !== "have" && line.had) Object.assign(line, { had: false, missingName: name });
    }
  }
  return lines.map((l) => ({ key: l.written.toLowerCase(), name: capitalize(l.missingName || l.written), had: l.had, ingredients: l.ingredients }));
}

// A recipe next to your Inventory, the one count every page shows ("3/5",
// "2 missing", "2 things to buy", Ready now). One line per food, in the recipe's
// order, named as the recipe first writes it (a missing line, as it writes the
// missing ingredient). A line is had when every ingredient in it is.
//   have, buy     [{ key, name }]
//   missing       the names in `buy`
//   totalCount, matchedCount, missingCount
export function recipeHave(recipe, kitchen) {
  const lines = recipeLines(recipe, kitchen);
  const item = (l) => ({ key: l.key, name: l.name });
  const have = lines.filter((l) => l.had).map(item);
  const buy = lines.filter((l) => !l.had).map(item);
  return {
    have,
    buy,
    missing: buy.map((i) => i.name),
    totalCount: lines.length,
    matchedCount: have.length,
    missingCount: buy.length,
  };
}

// Whether a recipe uses an Inventory item (Cook with, "uses expiring"). A prepared recipe is
// not made of ingredients, so it uses none (it is had by a prepared meal: `usesPreparedItem`).
export function recipeUsesItem(recipe, itemName) {
  if (isPreparedRecipe(recipe)) return false;
  return (recipe?.ingredients || []).some((ing) => ing?.name && itemCovers(itemName, ing.name));
}

// Whether a prepared recipe is this prepared meal in Inventory: the same name, by the matcher.
export function usesPreparedItem(recipe, item) {
  return isPreparedRecipe(recipe) && isPreparedMeal(item) && (recipe?.ingredients || []).some((ing) => ing?.name && itemCovers(item.name, ing.name));
}

// The recipes that use an Inventory item (the item pop-up's "N of your recipes use X"):
// the one matcher, so « Poulet » finds the chicken recipes. A meal (a leftover, a
// prepared meal) is not an ingredient, so no recipe uses it.
export function recipesUsingItem(item, recipes = []) {
  if (isMealItem(item)) return [];
  return recipes.filter((recipe) => !recipe.isPlaceholder && recipeUsesItem(recipe, item.name));
}

// One key per food, for lists that show each food once (Cook with's shelves and
// its expiring strip): « Poulet » and "Chicken" are one.
export function foodKey(name) {
  const p = foodProfile(name);
  if (!p.food) return `~${fold(name).trim()}`;
  return [p.food, p.derived || "", p.part || "", [...p.cuts].sort().join("+"), [...p.kinds].sort().join("+"), p.state].join("|");
}

// Inventory items still good that go off within `withinDays` days, soonest first.
// Meals (leftovers, prepared meals) are not ingredients and are left out.
export function expiringSoon(inventory = [], withinDays, { prepared = false } = {}) {
  const inPool = poolOf(prepared);
  return inventory
    .filter((item) => inPool(item) && item.expiresAt && daysUntil(item.expiresAt) >= 0 && daysUntil(item.expiresAt) <= withinDays)
    .sort((a, b) => daysUntil(a.expiresAt) - daysUntil(b.expiresAt));
}

// The app's "uses expiring" rule (the recipe card's "use soon", the Makeable
// card's pink strip, the Recipes count): the items going off within `withinDays`
// days that this recipe uses and no other planned meal uses already, soonest
// first.
export function expiringItemsIn(recipe, inventory, plannerEntries = [], allRecipes = [], withinDays = 3) {
  // A prepared recipe is about the prepared meals that go off soon, a recipe about its ingredients.
  const prepared = isPreparedRecipe(recipe);
  const soon = expiringSoon(inventory, withinDays, { prepared }).filter((item) => (prepared ? usesPreparedItem(recipe, item) : recipeUsesItem(recipe, item.name)));
  if (soon.length === 0) return soon;
  const byId = new Map(allRecipes.map((r) => [r.id, r]));
  const others = [];
  for (const entry of plannerEntries) {
    if (entry.isLeftover || entry.alreadyHave) continue;
    const other = byId.get(entry.recipeId) || entry.recipe;
    if (other && other.id !== recipe.id && !other.isPlaceholder) others.push(other);
  }
  return soon.filter((item) => !others.some((other) => (prepared ? usesPreparedItem(other, item) : recipeUsesItem(other, item.name))));
}

// A count is a count: "", "unit", "piece" and "each" are the same unit.
function unitKey(unit) {
  const u = canonicalUnit(unit || "");
  return u === "unit" || u === "piece" ? "" : u;
}

// `qty` of `fromUnit` in `toUnit`, or null when one can't be turned into the
// other (a clove of garlic is not a head; a cup of rice is not grams).
export function convertAmount(qty, fromUnit, toUnit) {
  if (qty == null || !Number.isFinite(Number(qty))) return null;
  let q = Number(qty);
  let from = unitKey(fromUnit);
  let to = unitKey(toUnit);
  if (from === "dozen") [q, from] = [q * 12, ""];
  if (to === "dozen") return from === "" ? q / 12 : null;
  if (from === to) return q;
  if (!from || !to) return null;
  return convertToUnit(q, from, to);
}

// How much a line of a recipe (recipeLines) needs at `scale`: its ingredients'
// amounts added up in the first one's unit (weights with weights, volumes with
// volumes, counts with counts). `quantity` is null when an ingredient gives no
// amount or one can't be converted; `parts` keeps each amount as written then.
export function lineNeed(ingredients = [], scale = 1) {
  const unit = ingredients[0]?.unit || null;
  const parts = [];
  let quantity = 0;
  for (const ing of ingredients) {
    const qty = ing.quantity != null ? ing.quantity * scale : null;
    parts.push({ quantity: qty, unit: ing.unit || null });
    const inUnit = quantity == null ? null : convertAmount(qty, ing.unit, unit);
    quantity = inUnit == null ? null : quantity + inUnit;
  }
  return { quantity: ingredients.length ? quantity : null, unit, parts };
}

// How much more of a food you would have to buy: what `need` (lineNeed) asks for
// minus what your Inventory items that are this food, still good, hold, in the
// need's unit. 0 when they hold enough; null when it can't be told (no amount,
// an item with no amount, units that don't convert, nothing in Inventory).
export function shortBy(need, name, inventory = [], options) {
  if (need?.quantity == null) return null;
  const items = matchingItems(name, inventory, options).filter(notExpired);
  if (items.length === 0) return null;
  let held = 0;
  for (const item of items) {
    const qty = item.quantity == null ? null : convertAmount(item.quantity, item.unit, need.unit);
    if (qty == null) return null;
    held += qty;
  }
  const rest = need.quantity - held;
  return rest > 1e-9 ? roundAmount(rest, need.unit) : 0;
}

// Amounts in grams and millilitres are whole numbers; others keep two decimals.
export function roundAmount(qty, unit) {
  if (qty == null) return null;
  const whole = ["g", "ml"].includes(unitKey(unit));
  return whole ? Math.round(qty) : Math.round(qty * 100) / 100;
}

// The "Take out of your Inventory" list for a meal cooked for `servings`.
// Rows, in the recipe's order:
//   { key, kind: "item", item, names, amount, ask, on, before, after }
//     An Inventory item and how much comes out, in the item's own unit. `ask`
//     when that can't be worked out (the units don't convert, the recipe gives
//     no amount, or the item has none): the row then waits for an amount and
//     starts switched off. When one item doesn't hold enough, the rest comes
//     from the next one.
//   { key, kind: "missing", names, on: false }  not in your Inventory
// A line naming several foods ("salt and pepper") is a row for each, with no
// amount; water from the tap has no row.
export function buildTakeOut({ recipe, servings, inventory = [] }) {
  const base = recipe?.baseServings || 1;
  const scale = (servings || base) / base;
  const left = new Map(inventory.map((item) => [item.id, item.quantity]));
  const byItem = new Map();
  const others = new Map();
  const order = [];

  const ingredients = [];
  for (const ing of recipe?.ingredients || []) {
    if (!ing?.name) continue;
    const foods = foodsOnLine(ing.name);
    if (foods.length === 1) ingredients.push(ing);
    else for (const food of foods) ingredients.push({ ...ing, name: food, quantity: null });
  }

  for (const ing of ingredients) {
    if (isTapWater(ing.name)) continue;
    const items = matchingItems(ing.name, inventory, { prepared: isPreparedRecipe(recipe) });
    const qty = ing.quantity != null ? ing.quantity * scale : null;

    if (items.length === 0) {
      const profile = foodProfile(ing.name);
      const key = `missing:${profile.state ? `${profile.state} ` : ""}${profile.core || ing.name.toLowerCase()}`;
      if (!others.has(key)) {
        others.set(key, { key, kind: "missing", names: [], on: false });
        order.push(key);
      }
      if (!others.get(key).names.includes(ing.name)) others.get(key).names.push(ing.name);
      continue;
    }

    // Take what the recipe uses from the first item, and any rest from the next
    // ones that can hold it.
    let need = qty;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const key = `item:${item.id}`;
      let row = byItem.get(key);
      if (row && !row.names.includes(ing.name)) row.names.push(ing.name);
      if (!row) {
        if (i > 0 && (need == null || need <= 0)) break;
        row = { key, kind: "item", item, names: [ing.name], amount: 0, ask: false, on: true, before: item.quantity ?? null };
        byItem.set(key, row);
        order.push(key);
      }
      const inItemUnit = convertAmount(need, ing.unit, item.unit);
      if (inItemUnit == null || item.quantity == null) {
        row.ask = true;
        break;
      }
      const available = left.get(item.id) ?? 0;
      const take = Math.min(inItemUnit, available);
      row.amount += take;
      left.set(item.id, available - take);
      const rest = inItemUnit - take;
      if (rest <= 1e-9) break;
      // What is still needed, back in the recipe's unit, for the next item.
      need = need * (rest / inItemUnit);
      if (i === items.length - 1) break;
    }
  }

  return order.map((key) => {
    const row = byItem.get(key) || others.get(key);
    if (row.kind !== "item") return row;
    if (row.ask) return { ...row, amount: null, on: false, after: null };
    const amount = roundAmount(row.amount, row.item.unit);
    const after = row.before == null ? null : roundAmount(Math.max(0, row.before - amount), row.item.unit);
    return { ...row, amount, after, on: row.on && amount > 0 };
  });
}

import { canonicalize, canonicalUnit, capitalize, singularize } from "./ingredientNames.js";
import { PHRASES, fold } from "./bilingual.js";
import { familyKey } from "./ingredientFamilies.js";
import { convertToUnit } from "./units.js";
import { daysUntil } from "./pantryInventory.js";
import { isMealItem } from "./mealItem.js";
import { findLink, linkKey, linksOnItemName, linksVersion } from "./inventoryLinks.js";

// Which Inventory item a recipe ingredient is, and how much of it a cooked
// meal takes out. The one matching in the app: every page that says whether you
// have an ingredient uses it (the recipe card, Makeable, the recipe pop-out, the
// Planner's search and meal card, Home, Recipes, the recipe form's preview), and
// so do the finished view's "Take out of your Inventory" list, "uses expiring"
// and Cook with, so they always agree.
//
// Two names are the same food when, once both are read in English:
//   - French names count: « Poulet », « Lait 2 % », « ail », « oignons », « pommes
//     de terre » (the flyers' word pairs in bilingual.js, plus the kitchen words
//     below that flyers rarely print);
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

// Kitchen words in French that the flyers' list doesn't have, singular and
// plural, longest first where it matters.
const KITCHEN_FR = [
  ["non sale", "unsalted"], ["sans sel", "unsalted"], ["demi sel", "salted"],
  ["hauts de cuisses", "thighs"], ["hauts de cuisse", "thighs"], ["haut de cuisse", "thigh"],
  ["pommes de terre", "potatoes"], ["pomme de terre", "potato"], ["patate douce", "sweet potato"],
  ["pois chiches", "chickpeas"], ["pois chiche", "chickpea"], ["creme sure", "sour cream"], ["creme 35", "heavy cream"],
  ["creme a cuisson", "cooking cream"], ["lait de coco", "coconut milk"], ["oignons verts", "green onions"], ["oignon vert", "green onion"],
  ["haricots noirs", "black beans"], ["haricots rouges", "kidney beans"], ["citron vert", "lime"], ["sauce soya", "soy sauce"],
  ["poudre d'ail", "garlic powder"], ["poudre d'oignon", "onion powder"], ["fromage feta", "feta"], ["fromage parmesan", "parmesan"],
  ["oignon", "onion"], ["carotte", "carrot"], ["tomate", "tomato"], ["champignon", "mushroom"], ["poivron", "bell pepper"], ["poivrons", "bell peppers"],
  ["citron", "lemon"], ["echalote", "shallot"], ["echalotes", "shallots"], ["persil", "parsley"], ["coriandre", "cilantro"],
  ["basilic", "basil"], ["gingembre", "ginger"], ["lentille", "lentil"], ["lentilles", "lentils"], ["nouilles", "noodles"],
  ["concombre", "cucumber"], ["courgette", "zucchini"], ["aubergine", "eggplant"], ["aubergines", "eggplants"], ["patate", "potato"],
  ["haricot", "bean"], ["haricots", "beans"], ["oeuf", "egg"], ["avocat", "avocado"], ["epinard", "spinach"],
  ["vinaigre", "vinegar"], ["moutarde", "mustard"], ["poireau", "leek"], ["poireaux", "leeks"], ["navet", "turnip"],
  ["fenouil", "fennel"], ["mangue", "mango"], ["framboise", "raspberry"], ["fraise", "strawberry"], ["bleuet", "blueberry"],
  ["pita", "pita"], ["pitas", "pitas"], ["tortilla", "tortilla"], ["tortillas", "tortillas"], ["yogourt", "yogurt"], ["yaourt", "yogurt"],
  ["bouillon", "stock"], ["poudre", "powder"], ["concentre", "paste"], ["puree", "puree"], ["vin", "wine"], ["mais", "corn"],
  ["grec", "greek"], ["grecque", "greek"], ["oignons", "onions"], ["carottes", "carrots"], ["tomates", "tomatoes"],
  // Salt, oil, baking basics and spices, so a French recipe's « sel » or
  // « origan » is the same food as salt and oregano.
  ["au gout", "to taste"], ["sel casher", "kosher salt"], ["gros sel", "coarse salt"], ["sel de mer", "sea salt"],
  ["sel de celeri", "celery salt"], ["sel d'oignon", "onion salt"], ["poivre noir", "black pepper"], ["poivre blanc", "white pepper"],
  ["poivre de cayenne", "cayenne pepper"], ["piment de cayenne", "cayenne pepper"], ["sel", "salt"], ["poivre", "pepper"],
  ["huile vegetale", "vegetable oil"], ["huile de canola", "canola oil"], ["huile de cuisson", "cooking oil"], ["enduit a cuisson", "cooking spray"],
  ["extra vierge", "extra-virgin"], ["farine tout usage", "all-purpose flour"], ["sucre brun", "brown sugar"], ["cassonade", "brown sugar"],
  ["poudre a pate", "baking powder"], ["poudre a lever", "baking powder"], ["bicarbonate de soude", "baking soda"],
  ["bicarbonate de sodium", "baking soda"], ["fecule de mais", "cornstarch"], ["extrait de vanille", "vanilla extract"],
  ["sauce soja", "soy sauce"], ["paprika fume", "smoked paprika"], ["cumin moulu", "ground cumin"], ["coriandre moulue", "ground coriander"],
  ["gingembre moulu", "ground ginger"], ["cannelle moulue", "ground cinnamon"], ["noix de muscade", "nutmeg"], ["muscade", "nutmeg"],
  ["curcuma", "turmeric"], ["cannelle", "cinnamon"], ["origan", "oregano"], ["thym", "thyme"], ["romarin", "rosemary"],
  ["feuilles de laurier", "bay leaves"], ["feuille de laurier", "bay leaf"], ["laurier", "bay leaf"], ["poudre de chili", "chili powder"],
  ["assaisonnement au chili", "chili powder"], ["poudre de cari", "curry powder"], ["assaisonnement italien", "italian seasoning"],
  ["flocons de piment", "chili flakes"], ["piment broye", "crushed red pepper"], ["piment de la jamaique", "allspice"],
  ["anis etoile", "star anise"], ["cardamome", "cardamom"], ["graines de fenouil", "fennel seeds"], ["graines de moutarde", "mustard seeds"],
  ["moutarde en poudre", "mustard powder"], ["cinq epices", "five spice powder"], ["seche", "dried"], ["sechee", "dried"],
  ["seches", "dried"], ["sechees", "dried"],
  // Words the rules below need in English: leaves, zest, cider, bulbs and the like.
  ["feuilles", "leaves"], ["feuille", "leaf"], ["zeste", "zest"], ["cidre", "cider"], ["limette", "lime"], ["bananier", "banana"],
  ["vigne", "vine"], ["cari", "curry"], ["bulbe", "bulb"], ["assaisonne", "seasoned"], ["assaisonnee", "seasoned"],
  ["balsamique", "balsamic"], ["pate de miso", "miso paste"], ["pate de tomate", "tomato paste"], ["pate de tomates", "tomato paste"],
  ["all purpose", "all-purpose"], ["eau froide", "cold water"], ["eau chaude", "hot water"], ["eau tiede", "warm water"], ["eau bouillante", "boiling water"], ["eau", "water"],
];

// "the" is English as often as it is « thé », so it is never read as tea here.
const LITTLE = new Set("a an and or of the to in for with on at de du des la le les l d un une au aux et ou en pour avec sur sans".split(" "));

const PHRASE_LIST = [...KITCHEN_FR, ...PHRASES.filter(([fr]) => fr !== "the")];
const WORD_MAP = new Map();
const MULTI = [];
for (const [fr, en] of PHRASE_LIST) {
  const key = fr.replace(/'/g, " ");
  if (/[ -]/.test(key)) MULTI.push([key, en]);
  else if (!WORD_MAP.has(key)) WORD_MAP.set(key, en);
}
MULTI.sort((a, b) => b[0].length - a[0].length);
const MULTI_RE = new RegExp(`(?<![a-z])(${MULTI.map(([fr]) => fr.replace(/[- ]/g, "[- ]+")).join("|")})(?![a-z])`, "g");
const MULTI_MAP = new Map(MULTI.map(([fr, en]) => [fr.replace(/[- ]/g, ""), en]));

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

// The leaves that are a product of their own: "lime leaves" is not lime, "grape
// leaves" are not grapes. Every other leaf is its herb ("basil leaves", "bay
// leaves"), which canonicalize leaves out. Joined into one word before that.
const OWN_LEAF_RE = /(?<![a-z])(?:(?:kaffir|makrut) )?(lime|banana|grape|vine|curry)s?[- ]+(?:leaf|leaves)(?![a-z])/g;
const OWN_LEAF_FR_RE = /(?<![a-z])(?:leaf|leaves) (?:(?:kaffir|makrut) )?(lime|banana|grape|vine|curry)s?(?![a-z])/g;

// A name in (mostly) English words: French phrases and words are swapped for
// their English, anything unknown is kept as written.
function toEnglish(name) {
  const text = fold(String(name || "").replace(/\([^)]*\)/g, " "))
    .replace(/['’]/g, " ")
    .replace(DESCRIBING_RE, " ")
    .replace(MULTI_RE, (m) => ` ${MULTI_MAP.get(m.replace(/[- ]/g, "")) || m} `)
    .replace(/\b(\d+)\s*%/g, " ");
  return text
    .split(/[^a-z0-9-]+/)
    .filter((w) => w && !LITTLE.has(w) && !/^\d/.test(w))
    .map((w) => WORD_MAP.get(w) || WORD_MAP.get(w.replace(/[sx]$/, "")) || w)
    .join(" ")
    .replace(OWN_LEAF_RE, "$1leaf")
    .replace(OWN_LEAF_FR_RE, "$1leaf");
}

// Words that say how a food is sold or kept, never which food it is.
const DESCRIPTORS = new Set(
  (
    "whole skim nonfat fat-free low-fat reduced-fat unsalted salted boneless skinless bone-in skin-on lean extra-lean extra-virgin virgin " +
    "organic bio plain natural regular low-sodium sodium-free no-salt-added light homemade store-bought mild moulu moulue moulus moulues all-purpose pure granulated bulb"
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
  ["crushed red pepper", "chiliflake"], ["chili flake", "chiliflake"], ["chile flake", "chiliflake"], ["corn starch", "cornstarch"],
];
// Names that are one food written two ways, said once here.
const SAME_FOOD = { "smoked paprika": "paprika", "cooking oil": "vegetable oil", "canola oil": "vegetable oil" };
// The colours that make "pepper" the vegetable.
const PEPPER_COLOURS = new Set(["red", "yellow", "green", "purple"]);
// Words that can sit beside "water" and leave it water from the tap.
const TAP_WATER_WORDS = new Set("water cold warm hot boiling lukewarm ice iced tap filtered cool room-temperature".split(" "));
// Words that only say what kind of thing it is ("pita bread" is pita).
const GENERIC = new Set(["bread", "cheese"]);
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

const profileCache = new Map();

// Everything the matching needs to know about one name.
export function foodProfile(name) {
  const key = String(name || "");
  if (profileCache.has(key)) return profileCache.get(key);

  let core = canonicalize(toEnglish(key)).core;
  const words0 = core.split(" ").filter((w) => w && !DESCRIPTORS.has(w) && !LITTLE.has(w));
  core = words0.join(" ");
  core = SAME_FOOD[core] || core;
  let joined = ` ${core} `;
  for (const [phrase, token] of COMPOUNDS) joined = joined.replace(` ${phrase} `, ` ${token} `);
  let words = joined.trim().split(" ").filter(Boolean);
  for (const [from, to] of SYNONYMS) {
    if (from.every((w) => words.includes(w))) words = [...new Set([...words.filter((w) => !from.includes(w)), ...to])];
  }
  // A style word on its own names its product: "miso" is "miso paste".
  const styled = words.filter((w) => !KINDS.has(w));
  if (styled.length === 1 && STYLE_WORDS[styled[0]]) words = [...words, STYLE_WORDS[styled[0]]];

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
  if (base.length > 1) base = base.filter((w) => !GENERIC.has(w));
  // A cut on its own ("flank steak", "sirloin") is still a meat.
  if (base.length === 0) {
    const fam = familyKey(words.join(" "));
    base = fam && fam !== words.join(" ") ? [fam] : [...cuts].map((c) => familyKey(c));
  }
  // Chicken is chicken whatever else the name says ("rotisserie chicken").
  const family = familyKey(base.join(" "));
  const food = family !== base.join(" ") ? family : [...base].sort().join(" ");

  const profile = { core, food, derived, cuts, kinds };
  profileCache.set(key, profile);
  return profile;
}

const overlaps = (a, b) => a.size === 0 || b.size === 0 || [...a].some((x) => b.has(x));

const lineFoods = new Map();

// The foods written on one ingredient line: the line itself, or its parts when it
// names several ("salt and pepper", « sel et poivre, au goût »). A part that is
// only a note ("to taste", "minced") is not a food.
export function foodsOnLine(name) {
  const key = String(name || "").trim();
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
  if (have.food !== want.food) return false;
  return overlaps(have.cuts, want.cuts) && overlaps(have.kinds, want.kinds);
}

const alsoCovers = ALSO_COVERS.map(([from, to]) => [foodProfile(from), foodProfile(to)]);

// Coriander written on its own (no "ground", no "seeds") is the herb, cilantro.
const isBareCoriander = (p) => p.food === "coriander" && !p.derived && p.cuts.size === 0 && p.kinds.size === 0;
const isCilantro = (p) => p.food === "cilantro" && !p.derived && p.cuts.size === 0 && p.kinds.size === 0;

// The rules that make two differently written names one food, after sameProfile.
function coveredAnotherWay(have, want) {
  if ((isBareCoriander(have) && isCilantro(want)) || (isCilantro(have) && isBareCoriander(want))) return true;
  // A whole fruit covers its juice and its zest.
  if (!have.derived && have.food === want.food && FRUIT_PARTS[have.food]?.includes(want.derived)) return true;
  return alsoCovers.some(([from, to]) => sameProfile(have, from) && sameProfile(to, want));
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

// The Inventory items that are this ingredient, the one to use first first:
// still good before past its date, then the soonest use-by date, then the oldest.
export function matchingItems(ingredientName, inventory = []) {
  const time = (d) => (d ? new Date(d).getTime() : Infinity);
  return inventory
    .filter((item) => isUsable(item) && itemCovers(item.name, ingredientName))
    .sort(
      (a, b) =>
        Number(notExpired(b)) - Number(notExpired(a)) ||
        time(a.expiresAt) - time(b.expiresAt) ||
        time(a.purchasedAt || a.createdAt) - time(b.purchasedAt || b.createdAt)
    );
}

// The first item still good that is this ingredient: what the blue ✓ shows.
export function haveItemFor(ingredientName, inventory = []) {
  return matchingItems(ingredientName, inventory).find(notExpired) || null;
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
  let table = answers.get(inventory);
  if (!table || table.day !== day || table.links !== links) {
    table = { day, links, byName: new Map() };
    answers.set(inventory, table);
  }
  return table;
}

// Whether you have an ingredient: every food on its line is water from the tap or
// an Inventory item still good.
function lineHave(name, inventory) {
  return foodsOnLine(name).every((food) => isTapWater(food) || haveItemFor(food, inventory));
}

// Where one ingredient stands: "have" (Inventory holds it, still good) or "need".
// What the recipe card's ✓ beside each ingredient shows.
export function ingredientHave(name, kitchen) {
  const table = answersFor(kitchen);
  if (!table.byName.has(name)) table.byName.set(name, lineHave(name, kitchen?.inventory || NO_ITEMS) ? "have" : "need");
  return table.byName.get(name);
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
  for (const ing of recipe?.ingredients || []) {
    const name = String(ing?.name || "").trim();
    if (!name || isTapWater(name)) continue;
    const status = ingredientHave(name, kitchen);
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

// Whether a recipe uses an Inventory item (Cook with, "uses expiring").
export function recipeUsesItem(recipe, itemName) {
  return (recipe?.ingredients || []).some((ing) => ing?.name && itemCovers(itemName, ing.name));
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
  return [p.food, p.derived || "", [...p.cuts].sort().join("+"), [...p.kinds].sort().join("+")].join("|");
}

// Inventory items still good that go off within `withinDays` days, soonest first.
// Meals (leftovers, prepared meals) are not ingredients and are left out.
export function expiringSoon(inventory = [], withinDays) {
  return inventory
    .filter((item) => isUsable(item) && item.expiresAt && daysUntil(item.expiresAt) >= 0 && daysUntil(item.expiresAt) <= withinDays)
    .sort((a, b) => daysUntil(a.expiresAt) - daysUntil(b.expiresAt));
}

// The app's "uses expiring" rule (the recipe card's "use soon", the Makeable
// card's pink strip, the Recipes count): the items going off within `withinDays`
// days that this recipe uses and no other planned meal uses already, soonest
// first.
export function expiringItemsIn(recipe, inventory, plannerEntries = [], allRecipes = [], withinDays = 3) {
  const soon = expiringSoon(inventory, withinDays).filter((item) => recipeUsesItem(recipe, item.name));
  if (soon.length === 0) return soon;
  const byId = new Map(allRecipes.map((r) => [r.id, r]));
  const others = [];
  for (const entry of plannerEntries) {
    if (entry.isLeftover || entry.alreadyHave) continue;
    const other = byId.get(entry.recipeId) || entry.recipe;
    if (other && other.id !== recipe.id && !other.isPlaceholder) others.push(other);
  }
  return soon.filter((item) => !others.some((other) => recipeUsesItem(other, item.name)));
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
export function shortBy(need, name, inventory = []) {
  if (need?.quantity == null) return null;
  const items = matchingItems(name, inventory).filter(notExpired);
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
    const items = matchingItems(ing.name, inventory);
    const qty = ing.quantity != null ? ing.quantity * scale : null;

    if (items.length === 0) {
      const key = `missing:${foodProfile(ing.name).core || ing.name.toLowerCase()}`;
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

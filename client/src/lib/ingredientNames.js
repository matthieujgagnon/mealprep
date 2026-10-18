// Ingredient names and units, as plain words: the grouping key ("core") of an
// ingredient, singular and plural, the canonical unit. The lowest layer: the grocery
// list (groceryList.js) and the shared Inventory matcher (inventoryMatch.js) are
// both built on it, and groceryList.js re-exports it.

// Produce/variety adjectives that shouldn't fragment the grocery list into
// separate line items (a "California avocado" and a plain "avocado" are the
// same shopping-list item). Extend this list as needed.
const VARIETY_WORDS = ["california", "haas", "roma"];

// Mirrors the alias map in server/src/lib/scrapeRecipe.js. Kept here too so
// recipes imported before that fix existed (stored as "tablespoons" instead
// of "tbsp") still group correctly instead of showing up as two line items.
const UNIT_ALIASES = {
  cup: "cup", cups: "cup",
  tbsp: "tbsp", tbsps: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp",
  tsp: "tsp", tsps: "tsp", teaspoon: "tsp", teaspoons: "tsp",
  g: "g", gram: "g", grams: "g",
  kg: "kg", kilogram: "kg", kilograms: "kg",
  oz: "oz", ounce: "oz", ounces: "oz",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  ml: "ml", milliliter: "ml", milliliters: "ml",
  l: "l", liter: "l", liters: "l",
  pinch: "pinch", pinches: "pinch",
  dash: "dash", dashes: "dash",
  clove: "clove", cloves: "clove",
  can: "can", cans: "can",
  slice: "slice", slices: "slice",
  unit: "unit", units: "unit",
  piece: "piece", pieces: "piece", pc: "piece", pcs: "piece",
  head: "head", heads: "head",
  bunch: "bunch", bunches: "bunch",
  stalk: "stalk", stalks: "stalk",
  sprig: "sprig", sprigs: "sprig",
  handful: "handful", handfuls: "handful",
  dozen: "dozen",
  jar: "jar", jars: "jar",
  bottle: "bottle", bottles: "bottle",
  package: "package", packages: "package", pkg: "package",
  box: "box", boxes: "box",
  bag: "bag", bags: "bag",
  "fl oz": "fl_oz", fl_oz: "fl_oz",
  each: "unit", ea: "unit",
  block: "block", blocks: "block",
  stick: "stick", sticks: "stick",
  loaf: "loaf", loaves: "loaf",
  fillet: "fillet", fillets: "fillet",
  portion: "portion", portions: "portion",
  leaf: "leaf", leaves: "leaf",
  carton: "carton", cartons: "carton",
  tub: "tub", tubs: "tub",
};

export function canonicalUnit(unit) {
  if (!unit) return "";
  const lower = unit.toLowerCase().replace(/\.$/, "");
  return UNIT_ALIASES[lower] || lower;
}

export function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function stripParens(str) {
  const withoutParens = str.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  // Defensive: also drop a stray unmatched "(" or ")" some sites' markup leaves
  // behind — e.g. "Lime juice )" has a trailing ")" with no matching "(".
  return withoutParens.replace(/^\(+\s*/, "").replace(/\s*\)+$/, "").trim();
}

// Crude singularization for grouping purposes only (display name keeps
// whatever form was first seen) — "avocados" and "avocado" should merge.
export function singularize(word) {
  // Words ending in "us" (hummus, asparagus, citrus, octopus) are singular
  // in their own right, not an "-s" plural of something — stripping the
  // final letter mangled them into nonsense ("hummus" -> "hummu") that
  // could never match any known-ingredient list again, which is exactly
  // why "asparagus" — already in the perishables list — was silently never
  // matching.
  if (word.endsWith("us") && word.length > 3) return word;
  if (word.endsWith("oes") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
  // Only words ending in a genuine sibilant sound ("-ches", "-shes",
  // "-sses", "-xes", "-zes" — boxes, dishes, watches, glasses) take a real
  // "-es" plural where both letters come off. Everything else ending in
  // "es" is actually a silent-e word plus a plain "-s" ("flake" -> "flakes",
  // "olive" -> "olives", "grape" -> "grapes", "lime" -> "limes") — chopping
  // both letters there ate the "e" and mangled a huge class of common
  // ingredient words ("red pepper flakes" -> "flak", "limes" -> "lim",
  // silently breaking the "lime" entry in the perishables list too).
  if (/(?:[sxz]|ch|sh)es$/.test(word) && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) return word.slice(0, -1);
  return word;
}

// Prep-note words that should be stripped from ingredient names before
// grouping — "red onion thinly sliced" and "red onion finely diced" both
// should reduce to "red onion" so they merge into a single grocery line item.
const PREP_WORDS = new Set([
  "thinly", "finely", "roughly", "coarsely", "freshly", "lightly",
  "sliced", "diced", "chopped", "minced", "grated", "shredded", "julienned",
  "peeled", "pitted", "halved", "quartered", "cubed", "cut", "torn",
  "roasted", "toasted", "cooked", "raw", "dried", "fresh", "frozen",
  "whisked", "beaten", "softened", "melted", "crumbled",
  "small", "medium", "large", "extra",
  "leaves", "leaf", "leav", "stalk", "stalks", "sprig", "sprigs",
  "strips", "strip", "pieces", "piece", "chunks", "chunk",
  "optional", "divided", "or", "more", "taste", "needed",
  "into", "and", "for", "to", "with",
  // Salt and pepper modifiers — without these, "kosher salt" or "coarse
  // black pepper" would be rows of their own next to plain "salt"/"pepper".
  // Deliberately NOT included here: "ground", "smoked", "crushed" — those
  // meaningfully distinguish different products to buy ("ground beef" vs
  // "beef" steak, "smoked salmon" vs "salmon"), so stripping them everywhere
  // would wrongly merge those grocery lines.
  "kosher", "sea", "himalayan", "coarse", "fine", "cracked", "table",
  "iodized",
]);

// A handful of phrasings are different words for the exact same
// shopping-list item, but can't go through PREP_WORDS above — "ground" is
// deliberately NOT a generic prep-word (stripping it everywhere would wrongly
// merge "ground beef" with "beef"). So instead of stripping "ground" from
// every ingredient, alias these specific known-equivalent full phrasings
// directly to the plain form once the rest of canonicalize() has run.
// Deliberately narrow — "white pepper" and "cracked black pepper" are left
// alone since those are genuinely different products, not just a respelling.
const CORE_ALIASES = {
  "ground black pepper": "pepper",
  "black pepper": "pepper",
  // "clove"/"cloves" can't go in PREP_WORDS above — a whole clove-of-garlic
  // count and the actual "cloves" spice (used whole or ground in baking)
  // are two completely different ingredients that both canonicalize through
  // the same word, so a blanket strip would wrongly erase the spice's own
  // core entirely. Aliasing the full "garlic clove(s)" phrase is narrow
  // enough to merge "garlic clove" with plain "garlic" (nobody buys cloves
  // as a separate item from a head of garlic) without touching "cloves" on
  // its own.
  "garlic clove": "garlic",
};

// Splits an ingredient name into a grouping key (core food, singularized,
// variety and prep words removed) and any variety words that were stripped.
export function canonicalize(rawName) {
  const words = stripParens(rawName)
    .toLowerCase()
    .replace(/[,.*]/g, "") // strip punctuation and asterisks
    .split(/\s+/)
    .filter(Boolean);

  const UNIT_PREFIXES = new Set(["can", "cans", "jar", "jars", "bag", "bags", "package", "packages", "pkg", "box", "boxes", "head", "heads", "bunch", "bunches", "block", "blocks", "carton", "cartons", "tub", "tubs", "loaf", "loaves", "stick", "sticks"]);

  const varieties = [];
  let skipFirst = false;
  const coreWords = words.filter((w, i) => {
    if (i === 0 && UNIT_PREFIXES.has(w)) { skipFirst = true; return false; }
    if (VARIETY_WORDS.includes(w)) { varieties.push(w); return false; }
    if (PREP_WORDS.has(w)) return false;
    return true;
  });
  let core = coreWords.map(singularize).join(" ").trim();
  core = CORE_ALIASES[core] || core;
  // The same words as written, before singularizing: the singular rules
  // are English ones ("pois chiches" -> "poi chich"), so French shows these.
  const written = coreWords.join(" ").trim();
  return { core, varieties, written };
}

import { convertToUnit } from "./units.js";

// Produce/variety adjectives that shouldn't fragment the grocery list into
// separate line items (a "California avocado" and a plain "avocado" are the
// same shopping-list item). Extend this list as needed.
const VARIETY_WORDS = ["california", "haas", "roma"];

// Common pantry basics most people already have on hand — separated out in
// the UI so the "real" shopping list isn't cluttered with olive oil every week.
export const STAPLE_WORDS = [
  "salt", "pepper", "black pepper", "olive oil", "vegetable oil", "canola oil",
  "cooking oil", "oil", "sugar", "brown sugar", "flour", "all-purpose flour",
  "baking powder", "baking soda", "soy sauce", "vinegar", "water", "cooking spray",
  "garlic powder", "onion powder", "vanilla extract", "cornstarch",
];

// Staples that are specifically spices/seasonings — shown in their own
// subsection so the list reads like an actual spice rack rather than being
// mixed in with oils and baking basics.
export const SPICE_WORDS = [
  "salt", "pepper", "black pepper", "garlic powder", "onion powder",
  "paprika", "smoked paprika", "cumin", "ground cumin", "oregano", "basil",
  "thyme", "cinnamon", "ground cinnamon", "nutmeg", "ground nutmeg",
  "chili powder", "cayenne", "cayenne pepper", "curry powder", "bay leaf",
  "bay leaves", "rosemary", "coriander", "ground coriander", "turmeric",
  "ground turmeric", "ginger", "ground ginger", "allspice", "ground allspice",
  "white pepper", "ground black pepper", "cracked black pepper",
  "red pepper flakes", "crushed red pepper", "italian seasoning",
  "chili flakes", "mustard powder", "ground mustard", "star anise",
  "cardamom", "fennel seed", "fennel seeds", "mustard seed", "mustard seeds",
  "onion salt", "celery salt", "five spice powder", "chinese five-spice powder",
];

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
  clove: "clove", cloves: "clove",
  can: "can", cans: "can",
  slice: "slice", slices: "slice",
};

function canonicalUnit(unit) {
  if (!unit) return "";
  const lower = unit.toLowerCase().replace(/\.$/, "");
  return UNIT_ALIASES[lower] || lower;
}

// Canonical unit list for the manual-entry dropdown, derived from the same
// alias map that powers grocery-list merging — so a unit picked from this
// list is guaranteed to already be in its canonical form.
export const UNIT_OPTIONS = [...new Set(Object.values(UNIT_ALIASES))];

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
function singularize(word) {
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
  // Spice/seasoning modifiers — without these, "kosher salt" or "coarse
  // black pepper" canonicalize to a core that never matches the plain
  // "salt"/"pepper" entries in STAPLE_WORDS/SPICE_WORDS below, so they never
  // get auto-recognized as staples. Deliberately NOT included here: "ground",
  // "smoked", "crushed" — those meaningfully distinguish different products
  // to buy ("ground beef" vs "beef" steak, "smoked salmon" vs "salmon"), so
  // stripping them everywhere would wrongly merge those grocery lines. The
  // spice-specific phrasings that need them ("ground cumin", "smoked
  // paprika") are handled as their own entries in SPICE_WORDS instead.
  "kosher", "sea", "himalayan", "coarse", "fine", "cracked", "table",
  "iodized",
]);

// Splits an ingredient name into a grouping key (core food, singularized,
// variety and prep words removed) and any variety words that were stripped.
export function canonicalize(rawName) {
  const words = stripParens(rawName)
    .toLowerCase()
    .replace(/[,.*]/g, "") // strip punctuation and asterisks
    .split(/\s+/)
    .filter(Boolean);

  const UNIT_PREFIXES = new Set(["can", "cans", "jar", "jars", "bag", "bags", "package", "packages", "pkg", "box", "boxes", "head", "heads", "bunch", "bunches", "block", "blocks"]);

  const varieties = [];
  let skipFirst = false;
  const coreWords = words.filter((w, i) => {
    if (i === 0 && UNIT_PREFIXES.has(w)) { skipFirst = true; return false; }
    if (VARIETY_WORDS.includes(w)) { varieties.push(w); return false; }
    if (PREP_WORDS.has(w)) return false;
    return true;
  });
  const core = coreWords.map(singularize).join(" ").trim();
  return { core, varieties };
}

// Combines every ingredient across all planner entries into one deduplicated
// list, scaling quantities by whatever servings each planned meal was set to,
// and grouping similar ingredients (e.g. "avocado" + "California avocado")
// into a single line. customStaples is the user's saved list (from the
// database) of ingredients they've dragged onto "pantry staples" before —
// merged with the built-in defaults. staplesCategoryOverrides is a core ->
// "spice" | "other" map from ingredients the user has dragged between the
// two staples subsections, taking priority over the automatic SPICE_WORDS
// detection.
//
// One row per ingredient CORE, always — never split across rows just because
// two recipes measured it differently. Quantities that share a unit (or a
// convertible unit class, like tbsp/tsp) are summed into one number; when a
// recipe measures something in a way that genuinely can't be combined with
// what's already there (e.g. "¼ red onion" vs "¼ cup diced red onion" — a
// fraction of a whole onion isn't the same kind of quantity as a cup), it's
// kept as a separate "part" on the SAME row rather than spawning a duplicate
// line item. See `parts` on each returned item.
export function buildGroceryList(plannerEntries, customStaples = [], staplesCategoryOverrides = {}) {
  const map = new Map(); // core -> { core, name, parts, usedIn, varieties, isStaple, isSpice }
  // Every spice is inherently a pantry staple (you don't buy cumin fresh
  // each week) — folding SPICE_WORDS into the staples set here means a new
  // entry only ever needs to be added to ONE list to get both isStaple and
  // isSpice, instead of needing to remember to keep two lists in sync.
  const staplesSet = new Set([...STAPLE_WORDS, ...SPICE_WORDS, ...customStaples.map((s) => s.toLowerCase())]);

  for (const entry of plannerEntries) {
    if (entry.isLeftover || entry.alreadyHave) continue; // reusing food, or already have what's needed — don't re-buy it
    const recipe = entry.recipe;
    if (!recipe) continue;
    const base = recipe.baseServings || 1;
    const scale = (entry.servings || base) / base;

    for (const ing of recipe.ingredients || []) {
      const unit = canonicalUnit(ing.unit);
      const { core, varieties } = canonicalize(ing.name);
      const resolvedCore = core || ing.name.toLowerCase();
      const qty = ing.quantity != null ? ing.quantity * scale : null;

      if (!map.has(resolvedCore)) {
        map.set(resolvedCore, {
          core: resolvedCore,
          name: capitalize(resolvedCore),
          parts: [],
          usedIn: new Set(),
          varieties: new Set(),
          isStaple: staplesSet.has(resolvedCore),
          isSpice: staplesCategoryOverrides[resolvedCore]
            ? staplesCategoryOverrides[resolvedCore] === "spice"
            : SPICE_WORDS.includes(resolvedCore),
        });
      }

      const existing = map.get(resolvedCore);
      existing.usedIn.add(recipe.title);
      varieties.forEach((v) => existing.varieties.add(v));
      // Keep the shorter display name (fewer prep words attached)
      const newName = capitalize(resolvedCore);
      if (newName.length < existing.name.length) existing.name = newName;

      addQuantityPart(existing.parts, qty, unit || null);
    }
  }

  return [...map.values()]
    .map((item) => {
      const parts = item.parts.length > 0 ? item.parts : [{ quantity: null, unit: null }];
      return {
        key: item.core,
        core: item.core,
        name: item.name,
        parts,
        // Legacy single-value fields — first part only. Fine for the common
        // case (one part); GroceryList.jsx reads `parts` directly to render
        // the rare multi-part row.
        quantity: parts[0].quantity,
        unit: parts[0].unit,
        usedIn: [...item.usedIn],
        varieties: [...item.varieties].map(capitalize),
        isStaple: item.isStaple,
        isSpice: item.isSpice,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Adds a (quantity, unit) pair into a row's part list — merging into an
// existing part when the units are identical or convertible within the same
// class (weight<->weight, volume<->volume), otherwise appending a new part
// so the amount still shows up on the same row instead of a duplicate row.
function addQuantityPart(parts, qty, unit) {
  for (const part of parts) {
    if (part.unit === unit) {
      part.quantity = part.quantity != null && qty != null ? part.quantity + qty : part.quantity ?? qty;
      return;
    }
    if (qty != null && part.quantity != null && part.unit && unit) {
      const converted = convertToUnit(qty, unit, part.unit);
      if (converted != null) {
        part.quantity += converted;
        return;
      }
    }
  }
  parts.push({ quantity: qty, unit: unit || null });
}

// Crude but useful: flags a grocery-list item if a significant word from its
// name shows up in a deal's item description (e.g. "chicken breast" ingredient
// matches "Boneless chicken breast" deal). Not exact matching — just a nudge.
export function findMatchingDeal(ingredientName, deals) {
  const words = ingredientName
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);

  return deals.find((deal) => {
    const item = deal.item.toLowerCase();
    return words.some((w) => item.includes(w));
  });
}

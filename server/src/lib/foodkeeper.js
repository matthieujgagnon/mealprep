import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Trimmed from the USDA FSIS FoodKeeper dataset (the same source data behind
// the government's own FoodKeeper app) - see data/foodkeeper.json for the
// generation notes. Real, science-backed shelf-life ranges rather than a
// guessed table, per an explicit ask not to invent numbers here.
const ENTRIES = JSON.parse(readFileSync(path.join(__dirname, "../../data/foodkeeper.json"), "utf8"));

const LOCATION_FIELD = { pantry: "pantryDays", fridge: "fridgeDays", freezer: "freezeDays" };

// The 13 category labels that actually occur in the bundled FoodKeeper data
// (see data/foodkeeper.json's generation notes), plus "other" for anything
// that doesn't match a product - real USDA groupings rather than an
// invented list, same principle as the expiration dates themselves.
export const CATEGORIES = [
  "Produce",
  "Meat",
  "Poultry",
  "Seafood",
  "Dairy Products & Eggs",
  "Grains, Beans & Pasta",
  "Baked Goods",
  "Condiments, Sauces & Canned Goods",
  "Beverages",
  "Deli & Prepared Foods",
  "Food Purchased Frozen",
  "Shelf Stable Foods",
  "Vegetarian Proteins",
  "Other",
];

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[,.*()]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Scores every entry by name/keyword relevance and returns the single best
// match for the product itself, or null if nothing matched at all - deciding
// "what product is this" is independent of which location's shelf life the
// caller happens to want. Each entry's own `keywords` list always has the
// row's base product name first (preserved from the source data's own
// ordering) - an exact match against that first keyword is a strong signal
// the entry is the same "grocery-aisle common name" thing the user typed, so
// it's weighted heavily over a plain word-overlap count.
//
// Deliberately NOT filtered to entries that have data for `location`: doing
// that used to mean a plain "milk" query skipped the canonical "Milk (plain
// or flavored)" entry (whose real FoodKeeper fridge guidance is "use the
// date on the package," so it carries no fridge day-range) and silently fell
// back to "Milk (ultra-pasteurized)" - a different, shelf-stable product -
// just because that one had fridge data. Better to report no suggestion for
// the location than to guess from the wrong product.
export function findBestMatch(name) {
  const queryWords = tokenize(name);
  if (queryWords.length === 0) return null;
  const normalizedQuery = name.trim().toLowerCase();

  let best = null;
  let bestScore = 0;
  let bestSpecificity = 0;
  for (const entry of ENTRIES) {
    const keywordSet = new Set(entry.keywords);
    const matchedCount = queryWords.filter((w) => keywordSet.has(w)).length;
    if (matchedCount === 0) continue;
    const exactBonus = entry.keywords[0] === normalizedQuery ? 100 : 0;
    const score = matchedCount + exactBonus;

    // Tie-break: what fraction of the entry's own display name (e.g.
    // "Chicken parts (breast halves, bone-in)") the query's words actually
    // account for, matched word-for-word. Prefers the plainer, more generic
    // product when two entries match the same number of query words, since
    // a query like "chicken breast" shouldn't preferentially surface a
    // stuffed/prepared variant just because it happens to share as many
    // keywords - it just has fewer *other* words in its own name that the
    // query didn't ask for.
    const nameWords = tokenize(entry.name);
    const nameOverlap = nameWords.filter((w) => queryWords.includes(w)).length;
    const specificity = nameOverlap / Math.max(1, nameWords.length);

    if (score > bestScore || (score === bestScore && specificity > bestSpecificity)) {
      best = entry;
      bestScore = score;
      bestSpecificity = specificity;
    }
  }
  return best;
}

// Suggests a category for an item from the same product match the
// expiration date is drawn from, so the two stay consistent with each
// other. Falls back to "Other" when nothing matched, or the matched
// entry's category isn't one of the known 13 (shouldn't happen with the
// bundled data, but never worth surfacing as a hard error to the user).
export function suggestCategory(name) {
  const match = findBestMatch(name);
  const category = match?.category;
  return category && CATEGORIES.includes(category) ? category : "Other";
}

// Suggests an expiration Date for an item purchased on `purchasedAt`, stored
// in `location` ("pantry" | "fridge" | "freezer"), based on the midpoint of
// the matched entry's day range. Returns null when no entry matched, or the
// matched entry has no numeric range for that location (e.g. fresh milk,
// whose real-world shelf life is printed on the carton, not a fixed range in
// this dataset) - the caller should leave the date for the user to set by
// hand in that case rather than guessing.
export function suggestExpiration(name, location, purchasedAt) {
  const field = LOCATION_FIELD[location];
  if (!field) return null;
  const match = findBestMatch(name);
  if (!match || !match[field]) return null;

  const { min, max } = match[field];
  const midDays = (min + max) / 2;
  const purchased = purchasedAt instanceof Date ? purchasedAt : new Date(purchasedAt);
  const expires = new Date(purchased.getTime() + midDays * 24 * 60 * 60 * 1000);
  return expires;
}

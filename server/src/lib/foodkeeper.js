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

// Naive plural stemmer, used only for the exact-whole-name check in
// findBestMatch's tie-break below - not for the keyword-set matching
// itself, since the bundled data already lists both forms in `keywords`
// where it matters. Without it, a query like "avocado" ties in score
// between "Avocados" (Produce, 3-4 fridge days) and "Avocado Oil" (Shelf
// Stable Foods, 2 pantry years), and the tie-break's word-overlap check
// picks the wrong one: "Avocados" doesn't match its own query word
// ("avocados" !== "avocado"), while "Avocado Oil" does, so the unrelated
// shelf-stable product wins purely because its display name happens to be
// singular.
function stem(word) {
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
  if (word.endsWith("es") && word.length > 3) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) return word.slice(0, -1);
  return word;
}

// True when the query and the entry's name are the exact same word(s),
// modulo plurals - e.g. "avocado" vs. "Avocados", or "tomatoes" vs.
// "Tomato". Deliberately narrower than a general stemmed-overlap count:
// widening the overlap check itself (instead of adding this as a special
// full-match case) also perturbs multi-word disambiguation elsewhere - e.g.
// "chicken breast" tokenizes to ["chicken","breast"], and stemming
// "breasts" -> "breast" everywhere would flip "Chicken parts (breast
// halves, bone-in)" losing its tie-break to "Stuffed, raw chicken
// breasts", the opposite of the exact case the comment on that tie-break
// already calls out.
function isExactPluralMatch(queryWords, nameWords) {
  if (queryWords.length !== nameWords.length) return false;
  const stemmedName = nameWords.map(stem).sort();
  const stemmedQuery = queryWords.map(stem).sort();
  return stemmedName.every((w, i) => w === stemmedQuery[i]);
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
    const specificity = isExactPluralMatch(queryWords, nameWords) ? 1 : nameOverlap / Math.max(1, nameWords.length);

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

// Human-readable version of a {min, max} day range, scaled to whichever
// unit reads most naturally - days under a month, months under a year,
// years beyond that - matching how the USDA FoodKeeper app itself presents
// these ranges rather than printing raw day counts like "540 days".
function formatDayRange(min, max) {
  if (max < 30) {
    return min === max ? `${min} day${min === 1 ? "" : "s"}` : `${min}–${max} days`;
  }
  if (max < 365) {
    const minMo = Math.max(1, Math.round(min / 30));
    const maxMo = Math.max(1, Math.round(max / 30));
    return minMo === maxMo ? `${minMo} month${minMo === 1 ? "" : "s"}` : `${minMo}–${maxMo} months`;
  }
  const minYr = Math.max(1, Math.round(min / 365));
  const maxYr = Math.max(1, Math.round(max / 365));
  return minYr === maxYr ? `${minYr} year${minYr === 1 ? "" : "s"}` : `${minYr}–${maxYr} years`;
}

// Same product match as suggestExpiration, but for every storage location at
// once rather than one - used by the Inventory page to show "what would
// this become in the Freezer?" for an item before the user moves it there,
// without a separate lookup per location. Returns null for a location the
// matched entry has no data for (see suggestExpiration's own note on why
// that's left alone rather than guessed).
export function suggestAllLocations(name, purchasedAt) {
  const match = findBestMatch(name);
  const purchased = purchasedAt instanceof Date ? purchasedAt : new Date(purchasedAt);
  const result = {};
  for (const location of Object.keys(LOCATION_FIELD)) {
    const range = match?.[LOCATION_FIELD[location]];
    if (!range) {
      result[location] = null;
      continue;
    }
    const { min, max } = range;
    const midDays = (min + max) / 2;
    result[location] = {
      expiresAt: new Date(purchased.getTime() + midDays * 24 * 60 * 60 * 1000),
      defaultDays: midDays,
      rangeLabel: formatDayRange(min, max),
    };
  }
  return result;
}

// "Freezes N months." for a matched ingredient, using the same bundled
// FoodKeeper freezer data as suggestAllLocations - the Riso Poster Flyers
// redesign's freeze tip line. Null when nothing matched or the matched
// entry has no freezer data (e.g. most produce, which FoodKeeper doesn't
// recommend freezing at all), so the caller can simply omit the tip rather
// than guessing.
export function freezeTip(name) {
  const match = findBestMatch(name);
  if (!match?.freezeDays) return null;
  const { min, max } = match.freezeDays;
  return `Freezes ${formatDayRange(min, max)}.`;
}

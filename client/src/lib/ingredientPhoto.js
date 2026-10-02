import { MEALDB_INGREDIENTS } from "./mealdbIngredients.js";
import { frenchToEnglish, looksFrench, splitBilingual } from "./bilingual.js";

// A generic photo for an Inventory item with none of its own: TheMealDB's
// picture of the closest ingredient ("Chicken breast fillets" -> Chicken
// Breast, "Bœuf haché maigre" -> Ground Beef), or null for no good match.

const fold = (text) =>
  String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function singular(w) {
  if (w.length <= 3) return w;
  if (w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (/(oes|ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
  if (/(ss|us|is)$/.test(w)) return w;
  return w.endsWith("s") ? w.slice(0, -1) : w;
}

// Same thing, other words.
const WORD_ALIASES = {
  yoghurt: "yogurt", yogourt: "yogurt", bbq: "barbeque", barbecue: "barbeque", chili: "chilli",
  eggplant: "aubergine", mayo: "mayonnaise", ketchup: "tomato ketchup", cheddar: "cheddar cheese",
  scallion: "spring onion", hamburger: "ground beef", hazelnut: "hazlenut",
};
const PHRASE_ALIASES = [
  [/\bgreen onions?\b/, "spring onions"],
  [/\bbell peppers?\b/, "peppers"],
  [/\bsourdough\b/, "bread"],
];
// A word alone with no ingredient of that exact name: its usual picture.
const HEAD_FALLBACK = {
  pasta: "Penne Pasta", olive: "Black Olives", steak: "Sirloin steak", berry: "Frozen Mixed Berries",
  pickle: "Dill Pickles", tortilla: "Tortillas", wrap: "Tortillas", juice: "Orange Juice", nut: "Almonds",
  bean: "Kidney Beans", fish: "White Fish", cookie: "Digestive Biscuits", biscuit: "Digestive Biscuits",
};

function words(text) {
  let t = fold(text).replace(/&/g, " and ");
  for (const [re, to] of PHRASE_ALIASES) t = t.replace(re, to);
  return t
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .flatMap((w) => (WORD_ALIASES[singular(w)] || w).split(" "))
    .map(singular);
}

let index = null;
function getIndex() {
  if (!index) index = MEALDB_INGREDIENTS.map((name) => ({ name, words: [...new Set(words(name))] }));
  return index;
}

export function mealdbImageUrl(name) {
  return `https://www.themealdb.com/images/ingredients/${encodeURIComponent(name)}-Small.png`;
}

// Compares scores in order: the first difference decides.
function beats(a, b) {
  const i = a.findIndex((v, k) => v !== b[k]);
  return i >= 0 && a[i] > b[i];
}

// The ingredient whose words all appear in the item's name: the one with
// the most words, then the one ending latest in the name (the noun comes
// last in English: "butter chicken" is chicken), then the shortest.
export function matchIngredient(itemName) {
  let name = splitBilingual(itemName).en;
  if (looksFrench(name)) name = frenchToEnglish(name) || name;
  const have = words(name);
  if (!have.length) return null;
  let best = null;
  for (const cand of getIndex()) {
    if (!cand.words.length || !cand.words.every((w) => have.includes(w))) continue;
    const score = [cand.words.length, Math.max(...cand.words.map((w) => have.lastIndexOf(w))), -cand.name.length];
    if (!best || beats(score, best.score)) best = { name: cand.name, score };
  }
  if (best) return best.name;
  return HEAD_FALLBACK[have[have.length - 1]] || null;
}

const cache = new Map();
export function genericPhotoUrl(itemName) {
  const key = String(itemName || "");
  if (!cache.has(key)) {
    const match = matchIngredient(key);
    cache.set(key, match ? mealdbImageUrl(match) : null);
  }
  return cache.get(key);
}

// The Flyers page shows one card per ingredient, not one row per flyer
// item: "Bananas" with Metro's, Super C's and Maxi's prices side by side.
// This turns a week of flyer rows (GET /api/deals) into those ingredients
// (Riso Flyers v4 handoff): the English half of a bilingual name, without
// brand, size or filler words, decides which ingredient a product is.
import { canonicalize, capitalize } from "./groceryList.js";

// "Kiwis | kiwis" -> { en: "Kiwis", fr: "kiwis" }. Flipp sends some names
// in both languages; a name without " | " is English only.
export function splitBilingual(text) {
  const parts = String(text || "")
    .split(/\s+\|\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return { en: parts[0] || "", fr: null };
  return { en: parts[0], fr: parts.slice(1).join(" | ") };
}

// Store and national brands, as they start a product name.
const BRANDS = [
  "president's choice", "presidents choice", "pc", "no name", "sans nom", "selection", "irresistibles", "irresistible",
  "compliments", "our finest", "great value", "kirkland signature", "kirkland", "maple leaf", "olymel", "lafleur",
  "schneiders", "lactantia", "natrel", "quebon", "oikos", "danone", "activia", "liberte", "iogo", "yoplait", "kraft",
  "heinz", "barilla", "catelli", "tropicana", "oasis", "del monte", "dole", "mccain", "kelloggs", "kellogg's",
  "christie", "dempsters", "dempster's", "villaggio", "bonduelle", "green giant", "clover leaf", "hellmanns",
  "hellmann's", "black diamond", "cracker barrel", "saputo", "armstrong", "campbells", "campbell's", "philadelphia",
  "becel", "sealtest", "tostitos", "doritos", "lays", "lay's", "ruffles", "quaker", "st-hubert", "black label",
  "blue menu", "mieux-etre", "mieux-être", "belsoy", "bubly", "lindt", "boreale", "boréale", "nestle", "nestlé",
  "general mills", "post", "ben's original", "uncle ben's", "dare", "leclerc", "vachon", "ziggy's",
];
const BRAND_RE = new RegExp(`(^|\\s)(${BRANDS.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?=\\s|$)`, "g");

// Words that describe the pack or the grade, not the ingredient.
const FILLER = new Set([
  "fresh", "organic", "large", "jumbo", "small", "medium", "mini", "premium", "select", "selected", "assorted",
  "variety", "varieties", "value", "family", "club", "pack", "package", "bag", "box", "tray", "each", "bonus",
  "boneless", "skinless", "extra", "lean", "regular", "original", "classic", "new", "imported", "product", "of",
]);

const SIZE_WORD = /^(\d+([.,]\d+)?)(g|kg|ml|l|lb|lbs|oz|ct|pk|x)?$/;

// The words that name the product: "Maple Leaf bacon, 375 g" -> "bacon".
export function productText(deal) {
  const { en } = splitBilingual(deal.matchName || deal.item);
  return en
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[,([]/)[0]
    .replace(/[®™*]/g, "")
    .replace(BRAND_RE, " ")
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9'%.-]/g, ""))
    .filter((w) => w && !FILLER.has(w) && !SIZE_WORD.test(w))
    .join(" ")
    .trim();
}

export function ingredientKeyOf(deal) {
  const text = productText(deal);
  return canonicalize(text).core || text || String(deal.item || "").toLowerCase();
}

// Products whose last word isn't the ingredient: peanut butter isn't
// butter, ice cream isn't cream.
const COMPOUNDS = new Set([
  "peanut butter", "almond butter", "apple butter", "ice cream", "sour cream", "cream cheese", "whipped cream",
  "green onion", "spring onion", "sweet potato", "coconut milk", "almond milk", "oat milk", "soy milk", "rice milk",
  "chocolate milk", "hot dog", "corn dog", "ground beef", "ground pork", "ground chicken", "ground turkey",
  "fish stick", "potato chip", "corn chip", "tortilla chip", "chocolate chip", "maple syrup", "pancake syrup",
  "soy sauce", "hot sauce", "tomato sauce", "pasta sauce", "fish sauce", "bell pepper", "chili pepper",
  "black pepper", "egg noodle", "rice noodle", "rice cake", "fruit cake", "cup cake", "pound cake",
  "orange juice", "apple juice", "grape juice", "cranberry juice", "lemon juice", "lime juice", "tomato juice",
  "cider vinegar", "wine vinegar", "olive oil", "canola oil", "vegetable oil", "coconut oil", "sesame oil",
]);

function isCompound(key) {
  const words = key.split(" ");
  for (let i = 0; i < words.length - 1; i++) {
    if (COMPOUNDS.has(`${words[i]} ${words[i + 1]}`)) return true;
  }
  return false;
}

// "maple bacon" joins "bacon" when plain bacon is on the flyers too; a
// compound ("peanut butter") never joins its last word.
function mergeTarget(key, keys) {
  if (isCompound(key)) return key;
  const words = key.split(" ");
  for (let i = 1; i < words.length; i++) {
    const tail = words.slice(i).join(" ");
    if (keys.has(tail)) return tail;
  }
  return key;
}

const STORE_ORDER_FALLBACK = (a, b) => a.localeCompare(b);

// A deal's price as the tiles compare it: per lb / per L when the size is
// known, else per item. null when the flyer price couldn't be read.
export function tilePrice(deal) {
  const price = deal.comparePrice ?? deal.unitPrice;
  const basis = deal.compareBasis || deal.unitBasis;
  if (price == null || !basis) return null;
  return { price, basis };
}

export function unitLabel(basis) {
  if (basis === "lb") return "per lb";
  if (basis === "L") return "per L";
  if (basis === "kg") return "per kg";
  return "each";
}

// Where a deal sits in its own 6-month range: 0 = the low, 1 = the high.
// null without a real range (new item, or only Quebec's average).
export function rangePosition(deal) {
  if (!deal || deal.isNew || deal.sixMonthLow == null || deal.sixMonthHigh == null) return null;
  if (deal.rangeSource === "quebec") return null;
  const cur = deal.comparePrice ?? deal.unitPrice;
  if (cur == null) return null;
  const { sixMonthLow: low, sixMonthHigh: high } = deal;
  if (high <= low) return null;
  return Math.max(0, Math.min(1, (cur - low) / (high - low)));
}

const DAY_MS = 24 * 60 * 60 * 1000;
export function daysLeft(validUntil, today = new Date()) {
  if (!validUntil) return null;
  const [y, m, d] = String(validUntil).split("-").map(Number);
  if (!y || !m || !d) return null;
  const end = Date.UTC(y, m - 1, d);
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((end - start) / DAY_MS);
}

// Every ingredient on this week's flyers. `store` keeps only that store's
// prices (an ingredient it doesn't carry disappears). Each ingredient:
//   key, name, sub, aisle, freeze, endsIn, photoDeal,
//   variants  - every product, cheapest first (for the open card),
//   tiles     - each store's cheapest product, in `storeOrder`,
//   lo, hi, gap, best (the cheapest product), t (its range position),
//   score     - the "Best deal" rank.
export function buildIngredients(deals, { store = null, storeOrder = [], today = new Date() } = {}) {
  const rows = (deals || []).filter((d) => !store || d.store === store);
  const keyed = rows.map((d) => ({ deal: d, key: ingredientKeyOf(d) }));
  const keys = new Set(keyed.map((k) => k.key));
  const groups = new Map();
  for (const { deal, key } of keyed) {
    const target = mergeTarget(key, keys);
    if (!groups.has(target)) groups.set(target, []);
    groups.get(target).push({ deal, own: key === target });
  }

  const orderOf = (s) => {
    const i = storeOrder.indexOf(s);
    return i === -1 ? storeOrder.length : i;
  };

  const result = [];
  for (const [key, members] of groups) {
    const all = members.map((m) => m.deal);
    // Compare prices only within the basis most products use (per lb vs
    // per item can't be ranked against each other).
    const basisCount = new Map();
    for (const d of all) {
      const p = tilePrice(d);
      if (p) basisCount.set(p.basis, (basisCount.get(p.basis) || 0) + 1);
    }
    const mainBasis = [...basisCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const priceOf = (d) => {
      const p = tilePrice(d);
      return p && p.basis === mainBasis ? p.price : Infinity;
    };
    const variants = [...all].sort((a, b) => priceOf(a) - priceOf(b) || String(a.item).localeCompare(String(b.item)));

    const byStore = new Map();
    for (const d of variants) if (!byStore.has(d.store)) byStore.set(d.store, d);
    const tiles = [...byStore.values()].sort((a, b) => orderOf(a.store) - orderOf(b.store) || STORE_ORDER_FALLBACK(a.store, b.store));

    const comparable = tiles.map(priceOf).filter((p) => p !== Infinity);
    const lo = comparable.length ? Math.min(...comparable) : null;
    const hi = comparable.length ? Math.max(...comparable) : null;
    const gap = comparable.length > 1 && hi > 0 ? (hi - lo) / hi : 0;
    const best = variants[0];
    const t = rangePosition(best);

    // Named after a product that is exactly this ingredient when there is
    // one ("Bananas"), in its own words rather than the singular key.
    const own = members.find((m) => m.own)?.deal || best;
    const ownWords = productText(own);
    const name = capitalize(canonicalize(ownWords).core === key ? ownWords : key);
    // The French name from whichever store's product has one.
    const fr = all.map((d) => splitBilingual(d.item).fr).find(Boolean);
    const { en } = splitBilingual(own.item);
    const sub = fr || (en && en.toLowerCase() !== name.toLowerCase() ? en : null);

    const endsList = all.map((d) => daysLeft(d.validUntil, today)).filter((n) => n != null && n >= 0);
    const freezeDeal = all.find((d) => d.freezeTip);
    const aisleCount = new Map();
    for (const d of all) aisleCount.set(d.aisle || "other", (aisleCount.get(d.aisle || "other") || 0) + 1);

    result.push({
      key,
      name,
      sub,
      aisle: [...aisleCount.entries()].sort((a, b) => b[1] - a[1])[0][0],
      freeze: freezeDeal ? freezeDeal.freezeTip.replace(/^Freezes\s+/i, "").replace(/\.$/, "") : null,
      endsIn: endsList.length ? Math.min(...endsList) : null,
      photoDeal: variants.find((d) => d.imageUrl) || best,
      variants,
      tiles,
      mainBasis,
      lo,
      hi,
      gap,
      best,
      t,
      score: t == null ? gap : (1 - t) * 0.6 + gap * 0.4,
      search: foldText(`${name} ${sub || ""} ${all.map((d) => `${d.item} ${d.matchName || ""}`).join(" ")}`),
    });
  }
  return result;
}

export function foldText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export const RANKS = {
  best: { label: "Best deal", sort: (a, b) => b.score - a.score || a.name.localeCompare(b.name) },
  gap: { label: "Store gap", sort: (a, b) => b.gap - a.gap || a.name.localeCompare(b.name) },
  cheapest: { label: "Cheapest", sort: (a, b) => (a.lo ?? Infinity) - (b.lo ?? Infinity) || a.name.localeCompare(b.name) },
  az: { label: "A to Z", sort: (a, b) => a.name.localeCompare(b.name) },
};

// The groups each "Slice by" makes, in display order.
export function sliceIngredients(list, slice, aisles) {
  let order;
  let keyOf;
  if (slice === "ends") {
    order = ["Ends within 2 days", "Ends this week", "Later"];
    keyOf = (g) => (g.endsIn != null && g.endsIn <= 2 ? order[0] : g.endsIn != null && g.endsIn <= 7 ? order[1] : order[2]);
  } else if (slice === "freeze") {
    order = ["Freezes well", "Eat fresh"];
    keyOf = (g) => (g.freeze ? order[0] : order[1]);
  } else {
    order = aisles.map((a) => a.label);
    const label = Object.fromEntries(aisles.map((a) => [a.id, a.label]));
    keyOf = (g) => label[g.aisle] || label.other || "Other";
  }
  const map = new Map();
  for (const g of list) {
    const k = keyOf(g);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(g);
  }
  return order.filter((n) => map.has(n)).map((n) => ({ name: n, items: map.get(n) }));
}

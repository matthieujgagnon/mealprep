// What a flyer price is compared against, so a deal has a "usual price"
// from its first week instead of only after months of weekly imports:
//
//   1. "store"  - the same product at the same store, over the last 6
//                 months of imported flyers (the original meter);
//   2. "stores" - the same product at any store over those 6 months;
//   3. "quebec" - Statistics Canada's monthly Quebec average for that kind
//                 of product, over its last 6 months.
//
// Prices are compared per lb or per L whenever the package size is known
// ("Butter, 454 g" at $4.99 is $4.99/lb), so a pack price lines up with a
// per-kilogram average and with other pack sizes.

import { isFoodWord } from "./bilingual.js";

const G_PER_LB = 453.59237;
const G_PER_OZ = 28.349523;
const NUM = String.raw`\d+(?:[.,]\d+)?`;
const SIZE_RE = new RegExp(
  String.raw`(?:(?<![\d.,])(\d{1,2})\s*[x×/]\s*)?(${NUM})(?:\s*(?:-|–|/|à|to)\s*(${NUM}))?\s*(kg|mg|g|gr|lbs?|oz|ml|l|litres?|liters?)(?![\p{L}\d])`,
  "iu"
);
const num = (s) => Number(String(s).replace(",", "."));

// The package's total weight (grams) or volume (mL) from its name, or null.
// "12 × 355 mL" (or "12/355 mL") is 4,260 mL; a "650-750 g" range counts
// as 700 g.
export function packageSize(text) {
  const m = SIZE_RE.exec(String(text || ""));
  if (!m) return null;
  const [, multi, from, to, rawUnit] = m;
  let amount = to ? (num(from) + num(to)) / 2 : num(from);
  if (multi) amount *= Number(multi);
  if (!(amount > 0)) return null;
  const unit = rawUnit.toLowerCase();
  if (unit === "kg") return { grams: amount * 1000 };
  if (unit === "g" || unit === "gr") return { grams: amount };
  if (unit === "mg") return { grams: amount / 1000 };
  if (unit === "lb" || unit === "lbs") return { grams: amount * G_PER_LB };
  if (unit === "oz") return { grams: amount * G_PER_OZ };
  if (unit === "ml") return { ml: amount };
  return { ml: amount * 1000 }; // l, litre(s), liter(s)
}

// How many items a pack holds when its name counts them ("SAC D'AVOCATS,
// 5 UN.", "mini cucumbers, 6 un. bag", "12 ct"), or null. Eggs are priced
// by the dozen everywhere, so a carton isn't split.
const COUNT_RE = /(?<![\d.,])(\d{1,2})\s*(?:un|ct|count|units?|pcs?|pieces?|morceaux|'s)\b\.?/i;
export function packCount(text) {
  const t = String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/gi, "oe");
  if (/\b(eggs?|oeufs?)\b/i.test(t)) return null;
  const m = COUNT_RE.exec(t);
  const n = m ? Number(m[1]) : 0;
  return n >= 2 && n <= 24 ? n : null;
}

// The deal's price in the basis it's best compared on: its own per-lb or
// per-L price, a pack price turned into per lb / per L from the size in its
// name, a counted bag's price per item, or else per item.
export function comparablePrice(deal) {
  if (deal.unitPrice == null || !deal.unitBasis) return null;
  if (deal.unitBasis !== "each") return { price: deal.unitPrice, basis: deal.unitBasis };
  const size = packageSize(deal.item) || packageSize(deal.matchName);
  if (size?.grams >= 20) return { price: round2(deal.unitPrice / (size.grams / G_PER_LB)), basis: "lb" };
  if (size?.ml >= 50) return { price: round2(deal.unitPrice / (size.ml / 1000)), basis: "L" };
  const count = packCount(deal.item);
  if (count) return { price: round2(deal.unitPrice / count), basis: "each" };
  return { price: deal.unitPrice, basis: "each" };
}

const round2 = (n) => Math.round(n * 100) / 100;

const STOP = new Set(
  "and or ou et with avec of de du des la le les the a an en au aux for pour selected assorted variety varieties varietes sortes choix pack paquet format size grand large small petit fresh frais fraiche each ch unit units unite unites package pkg club bonus value family familial new nouveau original classic regular".split(" ")
);
// Store and national brands: "PC salmon fillets" and "salmon fillets" are
// the same product for comparing prices.
const BRANDS = new Set(
  "pc presidents president's choice no name sans nom selection irresistibles irresistible compliments kirkland maple leaf olymel lafleur prix nagano benny rachels ricardo cage liner seaquest marina rey exceldor fontaine famille acres stefano lesters paysan gusta swanson dalisa foppen mastro papille pogo menu bleu gaspesien artisan metrogo unisoya voltigeurs ferme mere michel hygrade furca gastronomiques plaisirs sterling boucanerie gosselin fumoirs arahova mamzells lactantia natrel quebon oikos danone activia liberte iogo yoplait kraft heinz barilla catelli gallo tropicana oasis del monte dole mccain cheerios kelloggs christie dempsters villaggio bonduelle green giant clover leaf hellmanns black diamond cracker barrel saputo armstrong campbells philadelphia becel sealtest schneiders janes tostitos doritos lays ruffles quaker st-hubert black label blue menu".split(" ")
);

function stem(word) {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(oes|ches|shes|xes)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && /[sx]$/.test(word) && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

// The words that name the product, without brand, size or filler, as a
// sorted set: "PC Black Label Salmon Fillets, 400 g" -> ["fillet", "salmon"].
export function productWords(text) {
  const clean = String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/['’]s\b/g, "s")
    .replace(/[^a-z\s-]/g, " ")
    .replace(/-/g, " ");
  const words = clean
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w) && !BRANDS.has(w))
    .filter((w) => !/^(kg|g|gr|mg|lb|lbs|oz|ml|l)$/.test(w))
    .map(stem);
  return [...new Set(words)].sort();
}

// A prepared or processed form costs something else than the raw product:
// cooked, breaded or marinated chicken, a chicken pie or burgers aren't
// "Whole chicken". Smoked only counts for products that aren't smoked
// anyway (smoked salmon, not bacon).
export const PREPARED = new Set(
  "cooked hot roasted rotisserie breaded battered marinated seasoned stuffed skewer tournedo precooked smoked mock boiling burger nugget strip cutlet cutlette escalope fondue lasagna popcorn finger kebab souvlaki pulled bbq glazed wellington meatball tender".split(" ")
);
export const SMOKED_ANYWAY = new Set(["bacon", "wiener", "ham", "sausage"]);
// Parts of the animal: chicken legs or wings aren't a whole chicken. A
// Quebec "cuts" product ("Pork loin cuts") stands for any of its cuts.
export const PARTS = new Set("breast thigh leg drumstick wing ground back neck liver gizzard tenderloin chop rib roast loin shoulder belly shank cube".split(" "));
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const weekOf = (date) => Math.floor(new Date(date).getTime() / WEEK_MS);
const monthOf = (date) => new Date(date).toISOString().slice(0, 7);

// Past prices, ready to look up by product. `rows` are FlyerDeal rows
// (any week, any store, any source) from the last 6 months.
export function buildHistoryIndex(rows, now = new Date()) {
  const byKey = new Map(); // words key -> entries
  const byWord = new Map(); // word -> Set of words keys
  for (const row of rows) {
    const cmp = comparablePrice(row);
    if (!cmp) continue;
    const words = productWords(row.matchName || row.item);
    if (words.length === 0) continue;
    const key = words.join(" ");
    if (!byKey.has(key)) {
      byKey.set(key, []);
      for (const w of words) {
        if (!byWord.has(w)) byWord.set(w, new Set());
        byWord.get(w).add(key);
      }
    }
    const when = row.createdAt || now;
    byKey.get(key).push({ store: row.store, price: cmp.price, basis: cmp.basis, week: weekOf(when), month: monthOf(when) });
  }
  return { byKey, byWord };
}

// The words that say which product this is, beyond its main food: a cut
// ("breast", "ground"), a prepared form ("cooked", "breaded") or another
// food ("pie" in "chicken pie"). Another name only stands in for this one
// when it has all of them: plain "chicken" prices never stand in for a
// chicken pie, nor "salmon" for salmon fillets.
function specifiers(words) {
  return words.filter((w) => PREPARED.has(w) || PARTS.has(w) || isFoodWord(w));
}

// The past prices this deal is compared with, and where they come from.
// Same store first; then the most specific product name - all of whose
// words are in this deal's name ("salmon fillet" for "Atlantic salmon
// fillets"), and which names the same cut and form - at any store. Needs
// prices from at least two weeks.
export function findHistory(deal, index) {
  const cmp = comparablePrice(deal);
  if (!cmp) return null;
  const words = productWords(deal.matchName || deal.item);
  if (words.length === 0) return null;
  const key = words.join(" ");
  const sameBasis = (e) => e.basis === cmp.basis;
  const weeks = (entries) => new Set(entries.map((e) => e.week)).size;

  const exact = (index.byKey.get(key) || []).filter(sameBasis);
  const sameStore = exact.filter((e) => e.store === deal.store);
  if (weeks(sameStore) >= 2) return { source: "store", entries: sameStore, compare: cmp };

  // Candidate names: every stored name sharing a word, kept if all its
  // words are in this deal's name. A one-word name only stands for a
  // one- or two-word deal ("lemon" for "lemons", not for "lemon pie
  // filling").
  const candidates = new Set();
  for (const w of words) for (const k of index.byWord.get(w) || []) candidates.add(k);
  const mustHave = specifiers(words);
  let best = [];
  let bestSize = 0;
  for (const k of candidates) {
    const kWords = k.split(" ");
    if (!kWords.every((w) => words.includes(w))) continue;
    if (kWords.length === 1 && words.length > 2) continue;
    if (!mustHave.every((w) => kWords.includes(w))) continue;
    const entries = index.byKey.get(k).filter(sameBasis);
    if (entries.length === 0) continue;
    if (kWords.length > bestSize) {
      best = entries;
      bestSize = kWords.length;
    } else if (kWords.length === bestSize) {
      best = best.concat(entries);
    }
  }
  if (weeks(best) >= 2) return { source: "stores", entries: best, compare: cmp };
  return null;
}

// Six months, oldest first, each with its lowest price (null if none).
export function monthlySeries(entries, months) {
  const byMonth = new Map();
  for (const e of entries) {
    if (!months.includes(e.month)) continue;
    byMonth.set(e.month, Math.min(byMonth.get(e.month) ?? Infinity, e.price));
  }
  return months.map((month) => ({ month, price: byMonth.get(month) ?? null }));
}

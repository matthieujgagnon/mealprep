// Quebec's monthly average retail prices from Statistics Canada (table
// 18-10-0245-01, "Monthly average retail prices for selected products",
// built from retailers' checkout data). Used as the "what does this usually
// cost" baseline for flyer deals, before - or alongside - the app's own
// price history. Read through StatCan's Web Data Service (WDS).

import { frenchToEnglish, isFoodWord, splitBilingual } from "./bilingual.js";
import { PARTS, PREPARED, SMOKED_ANYWAY, packageSize } from "./priceCompare.js";

const WDS = "https://www150.statcan.gc.ca/t1/wds/rest";
export const STATCAN_TABLE = 18100245;
const LB_PER_KG = 0.45359237;
const G_PER_LB = 453.59237;

// STATCAN_WDS_URL overrides it (the e2e tests point it somewhere unreachable).
const wds = () => process.env.STATCAN_WDS_URL || WDS;

async function post(path, body, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let res;
  try {
    res = await fetchImpl(`${wds()}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(err.name === "AbortError" ? "Statistics Canada took too long to answer" : "couldn't connect to Statistics Canada");
  } finally {
    clearTimeout(timer);
  }
  // 409: tables are locked for updates overnight (midnight-8:30 ET).
  if (res.status === 409) throw new Error("Statistics Canada is updating its tables - try again after 8:30 am");
  if (!res.ok) throw new Error(`Statistics Canada answered ${res.status}`);
  return res.json();
}

// The table's two dimensions: Geography and Products. Returns the Quebec
// member id and every product member.
export function readCubeMetadata(data) {
  const cube = (Array.isArray(data) ? data[0] : data)?.object;
  const dims = cube?.dimension || [];
  const byName = (re) => dims.find((d) => re.test(d.dimensionNameEn || ""));
  const geo = byName(/geograph/i) || dims[0];
  const products = byName(/product/i) || dims[1];
  if (!geo || !products) throw new Error("Statistics Canada's table layout wasn't recognized");
  const quebec = (geo.member || []).find((m) => /^qu[ée]bec$/i.test(String(m.memberNameEn || "").trim()));
  if (!quebec) throw new Error("Quebec isn't in Statistics Canada's price table");
  return {
    geoPosition: geo.dimensionPositionId ?? 1,
    productPosition: products.dimensionPositionId ?? 2,
    quebecId: quebec.memberId,
    products: (products.member || [])
      .filter((m) => m.memberId != null && m.memberNameEn)
      .map((m) => ({ id: m.memberId, name: String(m.memberNameEn).trim() })),
  };
}

// WDS coordinates are ten dot-separated member ids, one per dimension, 0
// for unused ones.
export function coordinate(parts) {
  const ids = Array(10).fill(0);
  for (const [position, id] of parts) ids[position - 1] = id;
  return ids.join(".");
}

// "Chicken breasts, per kilogram" -> chicken breasts at $/lb; "Milk, 2
// litres" -> $/L; "Butter, 454 grams" -> $/lb; "Eggs, 12 units" -> each
// (a dozen, the way flyers price eggs); "Cucumber, unit" -> each. `factor`
// turns the table's price into the app's unit price. null for a size it
// can't convert.
export function parseProductName(name) {
  const [head, ...rest] = String(name).split(",");
  const size = rest.join(",").trim().toLowerCase();
  const item = head.trim().toLowerCase();
  if (!item || !size) return null;

  let m;
  if (/^per kilogram$/.test(size)) return { item, basis: "lb", factor: LB_PER_KG };
  if ((m = size.match(/^([\d.]+)\s*kilograms?$/))) return { item, basis: "lb", factor: LB_PER_KG / Number(m[1]) };
  if ((m = size.match(/^([\d.]+)\s*grams?$/))) return { item, basis: "lb", factor: G_PER_LB / Number(m[1]) };
  if (/^per litre$/.test(size)) return { item, basis: "L", factor: 1 };
  if ((m = size.match(/^([\d.]+)\s*litres?$/))) return { item, basis: "L", factor: 1 / Number(m[1]) };
  if ((m = size.match(/^([\d.]+)\s*millilitres?$/))) return { item, basis: "L", factor: 1000 / Number(m[1]) };
  if (/^(unit|per unit|each)$/.test(size)) return { item, basis: "each", factor: 1 };
  if ((m = size.match(/^(\d+)\s*units?$/))) {
    // A dozen eggs is compared as a dozen; other multi-packs per unit.
    return /egg/.test(item) ? { item, basis: "each", factor: 1 } : { item, basis: "each", factor: 1 / Number(m[1]) };
  }
  return null;
}

// Each Quebec product's last `months` monthly prices, converted to the
// app's unit price. Products whose size can't be converted are skipped.
export async function fetchQuebecPrices({ months = 12, fetchImpl = fetch } = {}) {
  const meta = readCubeMetadata(await post("getCubeMetadata", [{ productId: STATCAN_TABLE }], fetchImpl));
  const products = meta.products.map((p) => ({ ...p, parsed: parseProductName(p.name) })).filter((p) => p.parsed);

  const results = [];
  for (let i = 0; i < products.length; i += 100) {
    const batch = products.slice(i, i + 100);
    const body = batch.map((p) => ({
      productId: STATCAN_TABLE,
      coordinate: coordinate([
        [meta.geoPosition, meta.quebecId],
        [meta.productPosition, p.id],
      ]),
      latestN: months,
    }));
    const data = await post("getDataFromCubePidCoordAndLatestNPeriods", body, fetchImpl);
    const byCoordinate = new Map();
    for (const entry of Array.isArray(data) ? data : []) {
      if (entry?.status !== "SUCCESS" || !entry.object) continue;
      byCoordinate.set(String(entry.object.coordinate), entry.object.vectorDataPoint || []);
    }
    batch.forEach((p, j) => {
      const points = (byCoordinate.get(body[j].coordinate) || [])
        .filter((pt) => pt && pt.value != null && Number.isFinite(Number(pt.value)))
        .map((pt) => ({
          month: String(pt.refPer || "").slice(0, 7),
          price: Math.round(Number(pt.value) * 10 ** Number(pt.scalarFactorCode || 0) * p.parsed.factor * 100) / 100,
        }))
        .filter((pt) => /^\d{4}-\d{2}$/.test(pt.month))
        .sort((a, b) => a.month.localeCompare(b.month));
      if (points.length) {
        results.push({ product: p.name, item: p.parsed.item, unitBasis: p.parsed.basis, history: points });
      }
    });
  }
  return results;
}

const STOP = new Set(["and", "or", "with", "of", "the", "fresh", "frozen", "canned", "regular", "whole", "per"]);
function words(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bstrip\s+loin\b/g, "striploin")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map((w) => w.replace(/(ies)$/, "y").replace(/(oes|ses|xes)$/, (s) => s.slice(0, -2)).replace(/s$/, ""));
}

// The baseline for a deal: same unit basis, and every word of the
// StatCan item ("chicken breast") in the deal's name ("boneless skinless
// chicken breasts"). The most specific match wins; between equally
// specific ones, the pack size closest to the deal's (a 4 L jug of milk is
// compared with "Milk, 4 litres", loose onions with "Onions, per
// kilogram"). And it has to be the same product, not just share a word:
//
// A word that makes something else of the product: "apple-cinnamon bread"
// is bread and "apple juice" is juice, not apples; condensed milk, ice
// cream and puff pastry aren't milk, cream and butter. Only counts when
// the Quebec product doesn't name it too ("apple juice" still matches
// "Apple juice"). Checked in both languages ("CROUSTILLES ... | HIGH
// PROTEIN POTATO" is chips).
const OTHER_PRODUCT = new Set(
  "bread bun pastry puff cake pie crumble muffin croissant juice sauce snack chip bar cooky cookie cracker cereal jam spread soup drink cocktail candy chocolate pizza dinner combo platter salad coconut coco condensed evaporated almond soy oat peanut ice sour whipped flavoured flavored flour paste fried fry frie crispy dough crust pop pocket bagel submarine cherry grape dip dressing seasoning powder bite".split(" ")
);
// What a "cuts" product's cuts are called on a flyer: parts, steaks, fillets.
const CUT_NAMES = new Set([...PARTS, "steak", "fillet", "medallion", "cutlet"]);
const FRESH_ONLY = /\b(fresh|frais|fraiche|steak|steaks|sushi|sashimi|poke|fillets?|filets?)\b/;

// Every word the deal is known by: its match name, its English name and
// its French name in English.
function allWords(deal) {
  const { en, fr } = splitBilingual(deal.item || "");
  return new Set(words(`${deal.matchName || ""} ${en} ${fr ? frenchToEnglish(fr) : ""}`));
}

// The size a Statistics Canada product is priced at, in grams or mL;
// null for "per kilogram" / "unit".
function baselineSize(product) {
  const size = String(product || "").split(",").slice(1).join(",").trim().toLowerCase();
  const m = size.match(/^([\d.]+)\s*(kilograms?|grams?|litres?|millilitres?)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return /^kilo|^litre/.test(m[2]) ? n * 1000 : n;
}

function sizeDistance(dealSize, product) {
  // An item sold loose is compared as about a pound.
  const a = dealSize ?? 454;
  const b = baselineSize(product) ?? 454;
  return Math.abs(Math.log(a / b));
}

export function findBaseline(deal, baselines) {
  if (deal.unitPrice == null || !deal.unitBasis) return null;
  const dealWords = words(deal.matchName || deal.item);
  const have = new Set(dealWords);
  const every = allWords(deal);
  const text = `${deal.item || ""} ${deal.matchName || ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const pack = packageSize(deal.item) || packageSize(deal.matchName);
  const dealSize = pack ? pack.grams ?? pack.ml : null;

  let best = null;
  let bestRank = null;
  for (const b of baselines) {
    if (b.unitBasis !== deal.unitBasis) continue;
    const item = String(b.item || "").toLowerCase();
    const cuts = /\bcuts?\b/.test(item);
    const need = words(item).filter((w) => w !== "cut");
    if (need.length === 0 || !need.every((w) => have.has(w))) continue;
    if ([...every].some((w) => OTHER_PRODUCT.has(w) && !need.includes(w))) continue;
    if ([...every].some((w) => PREPARED.has(w) && !need.includes(w) && !(w === "smoked" && need.some((n) => SMOKED_ANYWAY.has(n))))) continue;
    if (dealWords.some((w) => PARTS.has(w) && !need.includes(w) && !(cuts && w !== "ground"))) continue;
    // Another food after the matched words names the product: "grape
    // tomatoes" are tomatoes, "chicken pie" is pie.
    const lastNeed = Math.max(...need.map((w) => dealWords.lastIndexOf(w)));
    if (dealWords.slice(lastNeed + 1).some((w) => isFoodWord(w) && !need.includes(w) && !(cuts && CUT_NAMES.has(w)))) continue;
    // Frozen broccoli is for frozen broccoli; canned tuna is a can, not a
    // fresh tuna steak or a basket of pears.
    if (/\bfrozen\b/.test(item) && !/\b(frozen|surgel|congel)/.test(text)) continue;
    if (/\bcanned\b/.test(item)) {
      const canned = /\b(canned|cans?|tins?|conserve)\b/.test(text);
      const smallPack = dealSize != null && dealSize <= 1000;
      if (!canned && (!smallPack || FRESH_ONLY.test(text))) continue;
    }
    const rank = [need.length, -sizeDistance(dealSize, b.product)];
    if (!best || rank[0] > bestRank[0] || (rank[0] === bestRank[0] && rank[1] > bestRank[1])) {
      best = b;
      bestRank = rank;
    }
  }
  return best;
}

// How a deal's price compares with the Quebec average: percent above (+)
// or below (-), and a plain verdict.
export function compareToBaseline(unitPrice, averagePrice) {
  if (!averagePrice) return null;
  const pct = Math.round(((unitPrice - averagePrice) / averagePrice) * 100);
  const verdict = pct <= -25 ? "stock-up" : pct <= -10 ? "good" : pct <= 10 ? "normal" : "high";
  return { pct, verdict };
}

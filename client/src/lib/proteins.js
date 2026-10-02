// "What proteins are on sale this week": the Home dashboard's answer, one
// row per kind of meat or fish. Only plain, raw cuts count - a chicken pie,
// breaded fish sticks, sausages or deli meats aren't what you mean by
// "chicken's on sale". Each kind's best buy is its biggest real saving
// (see dealVerdict / dealSavings), then its lowest price per lb.
import { capitalize } from "./groceryList.js";
import { dealSavings, dealVerdict, foldText, productText, tilePrice } from "./flyerIngredients.js";

export const PROTEINS = [
  { id: "chicken", label: "Chicken", emoji: "🍗", re: /\b(chicken|poulet|cornish hens?)\b/ },
  { id: "beef", label: "Beef", emoji: "🥩", re: /\b(beef|boeuf|bifteck|steaks?|roasts?|roti|sirloin|surlonge|striploin|strip loin|contre-filet|ribeye|faux-filet|brisket|bavette|stewing)\b/ },
  { id: "pork", label: "Pork", emoji: "🐖", re: /\b(pork|porc)\b/ },
  { id: "fish", label: "Fish", emoji: "🐟", re: /\b(salmon|saumon|trout|truite|tilapia|cod|morue|haddock|aiglefin|sole|halibut|fletan|pollock|goberge|tuna|thon|basa|mackerel|maquereau|arctic char|omble|steelhead|fish|poissons?)\b/ },
  { id: "seafood", label: "Seafood", emoji: "🦐", re: /\b(shrimps?|crevettes?|scallops?|petoncles?|mussels?|moules|lobsters?|homards?|crabs?|crabes?|calamari|squid|calmars?|oysters?|huitres?|clams?|palourdes)\b/ },
  { id: "turkey", label: "Turkey", emoji: "🦃", re: /\b(turkey|dinde|dindon)\b/ },
  { id: "lamb-veal", label: "Lamb & veal", emoji: "🐑", re: /\b(lamb|agneau|veal|veau)\b/ },
];

// Prepared or processed: not a plain cut of meat or fish.
const NOT_RAW = new RegExp(
  "\\b(" +
    [
      "cooked", "cuite?s?", "precooked", "roasted", "rotisserie", "hot", "chaud", "smoked", "fumee?s?", "breaded", "panee?s?", "battered",
      "pie", "pies", "pate", "pates", "tourtiere", "burgers?", "patties", "nuggets?", "croquettes?", "fingers?", "sticks?", "batonnets", "popcorn", "bites?",
      "mock", "simili", "sausages?", "saucisses?", "saucisson", "wieners?", "hot dogs?", "ham", "jambon", "bacon", "deli", "charcuteries?",
      "sliced meats?", "viandes? tranchees?", "salami", "pepperoni", "prosciutto", "lasagna", "lasagne", "pizza", "dinners?", "combos?",
      "platters?", "plateaux?", "soups?", "soupes?", "sauces?", "broth", "bouillon", "gravy", "salads?", "salades?", "sandwich(?:es)?",
      "wraps?", "spread", "canned", "conserve", "flaked", "pouch", "sushi", "wellington", "stuffed", "farcie?s?", "kebabs?", "souvlaki",
      "dumplings?", "noodles?", "pet", "cat", "dog", "chien", "chat", "treats?", "gateries", "jerky", "pogo", "rillettes", "creton", "shaved", "emincee?s?", "cold cuts",
    ].join("|") +
    ")\\b"
);

export function proteinOf(deal) {
  if (!deal || (deal.aisle && deal.aisle !== "meat" && deal.aisle !== "seafood")) return null;
  const text = foldText(`${deal.matchName || ""} ${deal.item || ""}`);
  if (NOT_RAW.test(text)) return null;
  // The first kind the name says: "pork and beef meatballs" isn't both.
  let best = null;
  for (const p of PROTEINS) {
    const m = p.re.exec(text);
    if (m && (best == null || m.index < best.index)) best = { protein: p, index: m.index };
  }
  return best?.protein ?? null;
}

const VERDICT_RANK = { "stock-up": 3, buy: 2, fair: 1, unknown: 0, skip: -1 };

// The display name: the product without brand or pack words.
export function proteinName(deal) {
  return capitalize(productText(deal) || String(deal.matchName || deal.item || "").toLowerCase());
}

// One entry per kind with something on this week's flyers, in PROTEINS
// order: { protein, best, onSale (the kind's items that are really on
// sale, best first), all (every item, best first) }. `best` is null when
// none is priced.
const rank = (d) => {
  const v = dealVerdict(d);
  const s = dealSavings(d);
  const per = tilePrice(d);
  return {
    verdict: VERDICT_RANK[v?.key] ?? 0,
    pct: s?.pct ?? 0,
    perLb: per?.basis === "lb" ? per.price : Infinity,
  };
};

// Best buy first: the surest verdict, then the biggest saving, then the
// lowest price per lb.
export function compareProteinDeals(a, b) {
  const ra = rank(a);
  const rb = rank(b);
  return rb.verdict - ra.verdict || rb.pct - ra.pct || ra.perLb - rb.perLb;
}

export function proteinsOnSale(deals) {
  const byKind = new Map();
  for (const d of deals || []) {
    if (d.unitPrice == null) continue;
    const p = proteinOf(d);
    if (!p) continue;
    if (!byKind.has(p.id)) byKind.set(p.id, []);
    byKind.get(p.id).push(d);
  }
  return PROTEINS.filter((p) => byKind.has(p.id)).map((protein) => {
    const all = [...byKind.get(protein.id)].sort(compareProteinDeals);
    const onSale = all.filter((d) => dealSavings(d));
    return { protein, best: onSale[0] || null, onSale, all };
  });
}

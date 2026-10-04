// "What proteins are on sale this week": the Home dashboard's answer, one
// row per kind of meat or fish. Only plain, raw cuts count - a chicken pie,
// breaded fish sticks, sausages or deli meats aren't what you mean by
// "chicken's on sale". Tofu counts as a kind too. Each kind's best buy is its biggest real saving
// (see dealVerdict / dealSavings), then its lowest price per lb.
import { capitalize } from "./groceryList.js";
import { dealSavings, dealVerdict, foldText, productText, tilePrice } from "./flyerIngredients.js";
import { matchesSearch } from "./recipeSearch.js";
import { t } from "../i18n/index.js";

const TOFU = /\btofu\b/;

export const PROTEINS = [
  { id: "chicken", get label() { return t("proteins.kinds.chicken"); }, emoji: "🍗", terms: ["chicken", "poulet"], re: /\b(chicken|poulet|cornish hens?)\b/ },
  { id: "beef", get label() { return t("proteins.kinds.beef"); }, emoji: "🥩", terms: ["beef", "boeuf", "bœuf", "steak", "brisket", "sirloin"], re: /\b(beef|boeuf|bifteck|steaks?|roasts?|roti|sirloin|surlonge|striploin|strip loin|contre-filet|ribeye|faux-filet|brisket|bavette|stewing)\b/ },
  { id: "pork", get label() { return t("proteins.kinds.pork"); }, emoji: "🐖", terms: ["pork", "porc"], re: /\b(pork|porc)\b/ },
  { id: "fish", get label() { return t("proteins.kinds.fish"); }, emoji: "🐟", terms: ["fish", "poisson", "salmon", "saumon", "trout", "truite", "tilapia", "haddock", "halibut", "tuna", "thon"], re: /\b(salmon|saumon|trout|truite|tilapia|cod|morue|haddock|aiglefin|sole|halibut|fletan|pollock|goberge|tuna|thon|basa|mackerel|maquereau|arctic char|omble|steelhead|fish|poissons?)\b/ },
  { id: "seafood", get label() { return t("proteins.kinds.seafood"); }, emoji: "🦐", terms: ["shrimp", "crevette", "scallop", "mussel", "moule", "lobster", "homard", "crab"], re: /\b(shrimps?|crevettes?|scallops?|petoncles?|mussels?|moules|lobsters?|homards?|crabs?|crabes?|calamari|squid|calmars?|oysters?|huitres?|clams?|palourdes)\b/ },
  { id: "turkey", get label() { return t("proteins.kinds.turkey"); }, emoji: "🦃", terms: ["turkey", "dinde"], re: /\b(turkey|dinde|dindon)\b/ },
  { id: "lamb-veal", get label() { return t("proteins.kinds.lamb-veal"); }, emoji: "🐑", terms: ["lamb", "agneau", "veal", "veau"], re: /\b(lamb|agneau|veal|veau)\b/ },
  { id: "tofu", get label() { return t("proteins.kinds.tofu"); }, emoji: "⬜", terms: ["tofu"], re: TOFU },
];

// `terms` are what Recipes' search looks for to find recipes with that kind
// (title, tags and ingredient names, English and French). Home counts and opens
// Recipes with exactly these, so the number it shows is the number of cards
// Recipes then lists.
export function proteinSearchQuery(protein) {
  return protein.terms.join(", ");
}

export function recipesUsingProtein(recipes, protein) {
  const query = proteinSearchQuery(protein);
  return (recipes || []).filter((r) => !r.isPlaceholder && matchesSearch(r, query));
}

// Whether an ingredient or product name is tofu, whatever kind: firm,
// extra-firm, silken, "tofu ferme".
export function mentionsTofu(name) {
  return TOFU.test(foldText(name || ""));
}

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
  if (!deal) return null;
  const text = foldText(`${deal.matchName || ""} ${deal.item || ""}`);
  // Meat and fish are in the meat and seafood aisles; tofu is wherever the
  // store keeps it (produce, dairy, deli), so its aisle doesn't rule it out.
  const meatAisle = !deal.aisle || deal.aisle === "meat" || deal.aisle === "seafood";
  if (!meatAisle && !TOFU.test(text)) return null;
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

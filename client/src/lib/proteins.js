// "What proteins are on sale this week": the Home dashboard's answer, one
// row per kind of meat or fish. Only plain, raw cuts count - a chicken pie,
// breaded fish sticks, sausages or deli meats aren't what you mean by
// "chicken's on sale". Tofu counts as a kind too. Each kind's best buy is its biggest real saving
// (see dealVerdict / dealSavings), then its lowest price per lb.
import { capitalize } from "./groceryList.js";
import { dealSavings, dealVerdict, foldText, productText, tilePrice } from "./flyerIngredients.js";
import { t } from "../i18n/index.js";

const TOFU = /\btofu\b/;

// One general protein per row on Home, however many specific items the flyers
// have under it. Each has two word lists:
//   re    what a flyer item's name says (whole words, English and French): any
//         of these puts that item under the general protein
//   terms what a recipe's ingredient names are checked for (a part of a word
//         counts; accents don't matter), see recipeUsesProtein below
export const PROTEINS = [
  {
    id: "chicken", get label() { return t("proteins.kinds.chicken"); }, emoji: "🍗",
    // breasts, thighs, drumsticks, wings, whole chicken, cornish hen...
    terms: ["chicken", "poulet", "drumstick", "pilon", "cornish hen"],
    re: /\b(chicken|poulet|cornish hens?|drumsticks?|pilons?|hauts? de cuisses?)\b/,
  },
  {
    id: "beef", get label() { return t("proteins.kinds.beef"); }, emoji: "🥩",
    // ground beef, steaks, roasts, brisket, stewing beef...
    terms: ["beef", "boeuf", "bœuf", "steak", "bifteck", "brisket", "sirloin", "ribeye", "striploin", "contre-filet", "faux-filet"],
    re: /\b(beef|boeuf|bifteck|steaks?|roasts?|roti|sirloin|surlonge|striploin|strip loin|contre-filet|ribeye|faux-filet|brisket|bavette|stewing)\b/,
  },
  {
    id: "pork", get label() { return t("proteins.kinds.pork"); }, emoji: "🐖",
    // pork chops, tenderloin, ground pork, ribs; bacon and ham count in recipes
    terms: ["pork", "porc", "bacon", "jambon", "pancetta", "prosciutto"],
    re: /\b(pork|porc)\b/,
  },
  {
    id: "fish", get label() { return t("proteins.kinds.fish"); }, emoji: "🐟",
    // salmon, cod, tilapia, trout, tuna, haddock, halibut...
    terms: [
      "fish", "poisson", "salmon", "saumon", "trout", "truite", "tilapia", "haddock", "halibut", "fletan", "flétan", "tuna", "thon",
      "cod", "morue", "pollock", "goberge", "mackerel", "maquereau", "sardine", "arctic char", "omble", "swordfish", "espadon", "snapper", "vivaneau",
    ],
    re: /\b(salmon|saumon|trout|truite|tilapia|cod|morue|haddock|aiglefin|sole|halibut|fletan|pollock|goberge|tuna|thon|basa|mackerel|maquereau|sardines?|arctic char|omble|steelhead|swordfish|espadon|snapper|vivaneau|fish|poissons?)\b/,
  },
  {
    id: "seafood", get label() { return t("proteins.kinds.seafood"); }, emoji: "🦐",
    // shrimp, scallops, mussels, lobster, crab, squid, oysters, clams...
    terms: [
      "shrimp", "prawn", "crevette", "scallop", "petoncle", "pétoncle", "mussel", "moule", "lobster", "homard", "crab", "crabe",
      "squid", "calmar", "calamari", "oyster", "huitre", "huître", "clam", "palourde",
    ],
    re: /\b(shrimps?|prawns?|crevettes?|scallops?|petoncles?|mussels?|moules|lobsters?|homards?|crabs?|crabes?|calamari|squid|calmars?|oysters?|huitres?|clams?|palourdes)\b/,
  },
  {
    id: "turkey", get label() { return t("proteins.kinds.turkey"); }, emoji: "🦃",
    terms: ["turkey", "dinde", "dindon"],
    re: /\b(turkey|dinde|dindon)\b/,
  },
  {
    id: "lamb-veal", get label() { return t("proteins.kinds.lamb-veal"); }, emoji: "🐑",
    terms: ["lamb", "agneau", "veal", "veau"],
    re: /\b(lamb|agneau|veal|veau)\b/,
  },
  { id: "tofu", get label() { return t("proteins.kinds.tofu"); }, emoji: "⬜", terms: ["tofu"], re: TOFU },
];

// Which of your recipes use a protein. One function, used by Home (the count in
// the bar) and by Recipes (the protein filter that "See them" opens), so the two
// always agree.
//
// It looks at each ingredient on its own, not at the recipe's text as a whole,
// and skips ingredients that only carry the protein's name as a flavour:
// "fish sauce" isn't fish, "chicken stock" isn't chicken. A recipe with no
// ingredients listed yet falls back to its title and tags.
const foldName = (text) =>
  foldText(text)
    .replace(/œ/g, "oe")
    .replace(/[’‘]/g, "'");

// Condiments, seasonings and stocks: the protein's name is in them, the protein
// isn't. Whole words or phrases, English and French, accents folded.
const SEASONING_RE = new RegExp(
  "(?:^|[^a-z])(?:" +
    [
      // sauces and pastes
      "fish sauce", "sauce (?:de |au |aux )?poissons?", "oyster sauce", "sauce (?:aux? |d')?huitres?", "anchov(?:y|ies) paste",
      "pate d'anchois", "shrimp paste", "pate de crevettes?", "clam juice", "jus de palourdes?", "clamato", "sauce", "salsa",
      // stocks, broths and the cubes and powders made from them
      "stocks?", "broths?", "bouillons?", "consomme", "fond", "fumet", "gravy", "demi-glace", "(?:chicken|poulet|beef|boeuf|fish|poisson|seafood) base",
      "(?:chicken|poulet|beef|boeuf|pork|porc|fish|poisson) (?:powder|poudre)", "(?:poudre|cubes?) (?:de |d')?(?:poulet|boeuf|poisson)", "oxo", "knorr",
      // seasonings and soups
      "seasonings?", "assaisonnements?", "spice mix", "rubs?", "(?:cream|creme) (?:of|de) (?:chicken|poulet)", "soups?", "soupes?",
      // not an animal at all
      "oyster mushrooms?", "pleurotes?",
    ].join("|") +
    ")(?![a-z])"
);

export function isSeasoningIngredient(name) {
  return SEASONING_RE.test(foldName(name));
}

// Whether one ingredient (or title, or tag) is that protein.
export function ingredientIsProtein(name, protein) {
  if (!name) return false;
  const text = foldName(name);
  if (SEASONING_RE.test(text)) return false;
  return protein.terms.some((term) => text.includes(foldName(term)));
}

export function recipeUsesProtein(recipe, protein) {
  if (!recipe || recipe.isPlaceholder) return false;
  const names = (recipe.ingredients || []).map((i) => i?.name).filter(Boolean);
  const texts = names.length > 0 ? names : [recipe.title, ...(recipe.tags || [])].filter(Boolean);
  return texts.some((text) => ingredientIsProtein(text, protein));
}

export function recipesUsingProtein(recipes, protein) {
  return (recipes || []).filter((r) => recipeUsesProtein(r, protein));
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

// Tofu is judged on its own: smoked, marinated, pouched or crispy tofu is
// still tofu you can cook with. Only a made dish with tofu in it (a soup, a
// salad, dumplings) or a look-alike is left out.
const TOFU_DISH = new RegExp(
  "\\b(" +
    [
      "soups?", "soupes?", "salads?", "salades?", "sandwich(?:es)?", "wraps?", "dumplings?", "noodles?", "nouilles", "sauces?",
      "sushi", "spread", "pet", "cat", "dog", "chien", "chat", "treats?", "burgers?", "nuggets?",
    ].join("|") +
    ")\\b"
);

export function proteinOf(deal) {
  if (!deal) return null;
  // "bœuf" is "boeuf" here: the ligature isn't an accent, so folding keeps it.
  const text = foldText(`${deal.matchName || ""} ${deal.item || ""}`).replace(/œ/g, "oe");
  if (TOFU.test(text)) return TOFU_DISH.test(text) ? null : PROTEINS.find((p) => p.id === "tofu");
  // Meat and fish are in the meat and seafood aisles; tofu is wherever the
  // store keeps it (produce, dairy, deli), so its aisle doesn't rule it out.
  const meatAisle = !deal.aisle || deal.aisle === "meat" || deal.aisle === "seafood";
  if (!meatAisle) return null;
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

// Home's list: every kind, always, in the order shown. `status` says what
// each has this week:
//   deal   - something really on sale (`best`, with `onSale` the others)
//   unsure - on a flyer, but nothing to say if it's a good price (tofu has
//            no Quebec average and flyers rarely print a regular price)
//   none   - nothing on the flyers, or only prices not worth it
// `products` is what opens under a card: the real sales for a deal, the
// priced items we can't judge yet for an unsure kind, nothing for none.
// Deals come first (best buy first), then the unsure ones, then the kinds
// with nothing, in PROTEINS order.
export function proteinRows(deals) {
  const found = new Map(proteinsOnSale(deals).map((k) => [k.protein.id, k]));
  const rows = PROTEINS.map((protein, order) => {
    const k = found.get(protein.id);
    if (k?.best) return { protein, order, status: "deal", best: k.best, onSale: k.onSale, products: k.onSale, all: k.all };
    const unsure = (k?.all || []).filter((d) => dealVerdict(d)?.key === "unknown");
    if (unsure.length > 0) return { protein, order, status: "unsure", best: unsure[0], onSale: [], products: unsure, all: k.all };
    return { protein, order, status: "none", best: null, onSale: [], products: [], all: k?.all || [] };
  });
  const group = { deal: 0, unsure: 1, none: 2 };
  return rows.sort((a, b) => group[a.status] - group[b.status] || (a.best && b.best ? compareProteinDeals(a.best, b.best) : 0) || a.order - b.order);
}

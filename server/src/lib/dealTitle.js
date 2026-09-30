// Flyer item names arrive however each source prints them: "PC BLACK LABEL
// SALMON FILLETS", "Huile D'Olive Extra Vierge (1 L)", "seedless navel
// oranges 3lb". tidyDealTitle rewrites one the way the rest of the app
// writes food - sentence case, with the package size moved to the end
// ("Salmon fillets, 1 L"-style, as in the Flyers design) - while keeping
// the words that are meant to be capitalized: store brands, places and
// grades.

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const UNIT = String.raw`kg|mg|gr|g|lbs|lb|oz|ml|litres?|liters?|l|unités?|units?|un|ct|pk|pack|pqt`;
const SIZE_RE = new RegExp(
  String.raw`(?<![\w.])(?:(\d+)\s*[x×]\s*)?(${NUM})(?:\s*(?:-|–|/|à|to)\s*(${NUM}))?\s*(${UNIT})(?![\p{L}\d])\.?`,
  "giu"
);

const UNIT_NAMES = { kg: "kg", mg: "mg", gr: "g", g: "g", lbs: "lb", lb: "lb", oz: "oz", ml: "mL", l: "L" };

function formatSize(multi, from, to, unit) {
  const num = (n) => n.replace(",", ".");
  const u = unit.toLowerCase();
  const amount = to ? `${num(from)}–${num(to)}` : num(from);
  if (/^(un|unités?|units?|ct|pk|pack|pqt)$/.test(u)) return `${amount}-pack`;
  const name = UNIT_NAMES[u] || (/^(litres?|liters?)$/.test(u) ? "L" : u);
  return `${multi ? `${multi} × ` : ""}${amount} ${name}`;
}

// Always upper case.
const UPPER = new Set(["pc", "bbq", "iga", "xl", "xxl", "xs", "aaa", "aa", "usa", "uht", "pei", "ii"]);

// Places, varieties and grades that stay capitalized.
const PROPER = Object.fromEntries(
  [
    "Canada", "Canadian", "Québec", "Quebec", "Ontario", "California", "Florida", "Mexico", "Mexican", "Chile", "Chilean",
    "Peru", "Italy", "Italian", "Greek", "French", "English", "Thai", "Indian", "Japanese", "Korean", "Chinese", "Atlantic",
    "Pacific", "Dijon", "Roma", "Angus", "Bartlett", "Gala", "Honeycrisp", "McIntosh", "Cortland", "Ambrosia", "Oka",
    "Parmigiano", "Reggiano", "Kalamata", "Yukon",
  ].map((w) => [w.toLowerCase(), w])
);

// Grocery brands common in Quebec flyers, as they write themselves.
const BRANDS = [
  "President's Choice", "No Name", "Sans Nom", "Irresistibles", "Compliments", "Kirkland", "Maple Leaf", "Olymel",
  "Lafleur", "Lactantia", "Natrel", "Québon", "Oikos", "Danone", "Activia", "Liberté", "iögo", "Yoplait", "Kraft",
  "Heinz", "Barilla", "Catelli", "Gallo", "Tropicana", "Oasis", "Del Monte", "Dole", "McCain", "Cheerios", "Kellogg's",
  "Christie", "Dempster's", "Villaggio", "Bonduelle", "Green Giant", "Clover Leaf", "Hellmann's", "Black Diamond",
  "Cracker Barrel", "Saputo", "Armstrong", "Coca-Cola", "Pepsi", "Nestlé", "Nescafé", "Maxwell House", "Tim Hortons",
  "Lipton", "Campbell's", "Ben's Original", "Philadelphia", "Becel", "Gay Lea", "Sealtest", "Janes", "Schneiders",
  "Tostitos", "Doritos", "Lay's", "Ruffles", "Quaker", "Kraft Dinner", "St-Hubert", "Ben & Jerry's", "Häagen-Dazs",
];
const BRAND_RES = BRANDS.map((b) => [
  new RegExp(String.raw`(?<![\p{L}'])${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\p{L}])`, "giu"),
  b,
]);

function caseWord(word) {
  const lower = word.toLowerCase();
  const bare = lower.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, "");
  if (UPPER.has(bare)) return lower.replace(bare, bare.toUpperCase());
  if (PROPER[bare]) return lower.replace(bare, PROPER[bare]);
  // Deliberate inner capitals ("McCain", "iPhone") are a brand's own spelling.
  if (/\p{Ll}\p{Lu}/u.test(word) && !/^\p{Lu}+$/u.test(word.replace(/[^\p{L}]/gu, ""))) return word;
  return lower;
}

export function tidyDealTitle(name) {
  let text = String(name || "")
    .replace(/[®™*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return text;

  const sizes = [];
  text = text.replace(SIZE_RE, (_, multi, from, to, unit) => {
    sizes.push(formatSize(multi, from, to, unit));
    return " ";
  });
  // What's left in brackets is a detail ("(selected varieties)"): it goes
  // after a comma like the size does.
  text = text.replace(/[([]\s*([^)\]]*?)\s*[)\]]/g, (_, inner) => (inner.trim() ? `, ${inner.trim()}, ` : " "));

  text = text
    .split(" ")
    .map(caseWord)
    .join(" ");
  for (const [re, brand] of BRAND_RES) text = text.replace(re, brand);

  const parts = text
    .split(",")
    .map((p) => p.replace(/\s+/g, " ").replace(/^[\s\-–:]+|[\s\-–:]+$/g, ""))
    .filter(Boolean);
  const tidy = [...parts, ...sizes].join(", ");
  return tidy.replace(/^\p{Ll}/u, (c) => c.toUpperCase());
}

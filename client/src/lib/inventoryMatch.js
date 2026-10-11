import { canonicalize, canonicalUnit, capitalize, singularize, STAPLE_WORDS, SPICE_WORDS } from "./groceryList.js";
import { PHRASES, fold } from "./bilingual.js";
import { familyKey } from "./ingredientFamilies.js";
import { convertToUnit } from "./units.js";
import { daysUntil } from "./pantryInventory.js";

// Which Inventory item a recipe ingredient is, and how much of it a cooked
// meal takes out. The one matching in the app: every page that says whether you
// have an ingredient uses it (the recipe card, Makeable, the recipe pop-out, the
// Planner's search and meal card, Home, Recipes, the recipe form's preview), and
// so do the finished view's "Take out of your Inventory" list, "uses expiring"
// and Cook with, so they always agree.
//
// Two names are the same food when, once both are read in English:
//   - French names count: « Poulet », « Lait 2 % », « ail », « oignons », « pommes
//     de terre » (the flyers' word pairs in bilingual.js, plus the kitchen words
//     below that flyers rarely print);
//   - the food words are the same, in any order (« fromage cheddar » is "cheddar
//     cheese"), with prep words, plurals, "whole", "2%", "unsalted", "boneless"
//     and the like left out;
//   - a colour or a variety ("yellow", "basmati", "greek", "roma") only tells two
//     foods apart when both names give one: "onion" covers "yellow onion", but red
//     and yellow onions are not the same;
//   - a cut works the same way: plain "chicken" covers thighs, but chicken breasts
//     don't cover chicken thighs;
//   - a stock, broth, powder, paste, sauce or juice is never the food it is made
//     of: « bouillon de poulet » is not chicken, garlic powder is not garlic;
//   - a pantry staple (salt, oil, spices, and anything marked as one) only
//     matches another staple.
// Leftovers (`isLeftover`) are a meal, not an ingredient, and never match.

// Kitchen words in French that the flyers' list doesn't have, singular and
// plural, longest first where it matters.
const KITCHEN_FR = [
  ["non sale", "unsalted"], ["sans sel", "unsalted"], ["demi sel", "salted"],
  ["hauts de cuisses", "thighs"], ["hauts de cuisse", "thighs"], ["haut de cuisse", "thigh"],
  ["pommes de terre", "potatoes"], ["pomme de terre", "potato"], ["patate douce", "sweet potato"],
  ["pois chiches", "chickpeas"], ["pois chiche", "chickpea"], ["creme sure", "sour cream"], ["creme 35", "heavy cream"],
  ["creme a cuisson", "cooking cream"], ["lait de coco", "coconut milk"], ["oignons verts", "green onions"], ["oignon vert", "green onion"],
  ["haricots noirs", "black beans"], ["haricots rouges", "kidney beans"], ["citron vert", "lime"], ["sauce soya", "soy sauce"],
  ["poudre d'ail", "garlic powder"], ["poudre d'oignon", "onion powder"], ["fromage feta", "feta"], ["fromage parmesan", "parmesan"],
  ["oignon", "onion"], ["carotte", "carrot"], ["tomate", "tomato"], ["champignon", "mushroom"], ["poivron", "bell pepper"], ["poivrons", "bell peppers"],
  ["citron", "lemon"], ["echalote", "shallot"], ["echalotes", "shallots"], ["persil", "parsley"], ["coriandre", "cilantro"],
  ["basilic", "basil"], ["gingembre", "ginger"], ["lentille", "lentil"], ["lentilles", "lentils"], ["nouilles", "noodles"],
  ["concombre", "cucumber"], ["courgette", "zucchini"], ["aubergine", "eggplant"], ["aubergines", "eggplants"], ["patate", "potato"],
  ["haricot", "bean"], ["haricots", "beans"], ["oeuf", "egg"], ["avocat", "avocado"], ["epinard", "spinach"],
  ["vinaigre", "vinegar"], ["moutarde", "mustard"], ["poireau", "leek"], ["poireaux", "leeks"], ["navet", "turnip"],
  ["fenouil", "fennel"], ["mangue", "mango"], ["framboise", "raspberry"], ["fraise", "strawberry"], ["bleuet", "blueberry"],
  ["pita", "pita"], ["pitas", "pitas"], ["tortilla", "tortilla"], ["tortillas", "tortillas"], ["yogourt", "yogurt"], ["yaourt", "yogurt"],
  ["bouillon", "stock"], ["poudre", "powder"], ["concentre", "paste"], ["puree", "puree"], ["vin", "wine"], ["mais", "corn"],
  ["grec", "greek"], ["grecque", "greek"], ["oignons", "onions"], ["carottes", "carrots"], ["tomates", "tomatoes"],
  // Pantry staples and spices, so a French recipe's « sel » or « origan » is an
  // "always have" like salt and oregano.
  ["au gout", "to taste"], ["sel casher", "kosher salt"], ["gros sel", "coarse salt"], ["sel de mer", "sea salt"],
  ["sel de celeri", "celery salt"], ["sel d'oignon", "onion salt"], ["poivre noir", "black pepper"], ["poivre blanc", "white pepper"],
  ["poivre de cayenne", "cayenne pepper"], ["piment de cayenne", "cayenne pepper"], ["sel", "salt"], ["poivre", "pepper"],
  ["huile vegetale", "vegetable oil"], ["huile de canola", "canola oil"], ["huile de cuisson", "cooking oil"], ["enduit a cuisson", "cooking spray"],
  ["extra vierge", "extra-virgin"], ["farine tout usage", "all-purpose flour"], ["sucre brun", "brown sugar"], ["cassonade", "brown sugar"],
  ["poudre a pate", "baking powder"], ["poudre a lever", "baking powder"], ["bicarbonate de soude", "baking soda"],
  ["bicarbonate de sodium", "baking soda"], ["fecule de mais", "cornstarch"], ["extrait de vanille", "vanilla extract"],
  ["sauce soja", "soy sauce"], ["paprika fume", "smoked paprika"], ["cumin moulu", "ground cumin"], ["coriandre moulue", "ground coriander"],
  ["gingembre moulu", "ground ginger"], ["cannelle moulue", "ground cinnamon"], ["noix de muscade", "nutmeg"], ["muscade", "nutmeg"],
  ["curcuma", "turmeric"], ["cannelle", "cinnamon"], ["origan", "oregano"], ["thym", "thyme"], ["romarin", "rosemary"],
  ["feuilles de laurier", "bay leaves"], ["feuille de laurier", "bay leaf"], ["laurier", "bay leaf"], ["poudre de chili", "chili powder"],
  ["assaisonnement au chili", "chili powder"], ["poudre de cari", "curry powder"], ["assaisonnement italien", "italian seasoning"],
  ["flocons de piment", "chili flakes"], ["piment broye", "crushed red pepper"], ["piment de la jamaique", "allspice"],
  ["anis etoile", "star anise"], ["cardamome", "cardamom"], ["graines de fenouil", "fennel seeds"], ["graines de moutarde", "mustard seeds"],
  ["moutarde en poudre", "mustard powder"], ["cinq epices", "five spice powder"], ["seche", "dried"], ["sechee", "dried"],
  ["seches", "dried"], ["sechees", "dried"],
];

// "the" is English as often as it is « thé », so it is never read as tea here.
const LITTLE = new Set("a an and or of the to in for with on at de du des la le les l d un une au aux et ou en pour avec sur sans".split(" "));

const PHRASE_LIST = [...KITCHEN_FR, ...PHRASES.filter(([fr]) => fr !== "the")];
const WORD_MAP = new Map();
const MULTI = [];
for (const [fr, en] of PHRASE_LIST) {
  const key = fr.replace(/'/g, " ");
  if (/[ -]/.test(key)) MULTI.push([key, en]);
  else if (!WORD_MAP.has(key)) WORD_MAP.set(key, en);
}
MULTI.sort((a, b) => b[0].length - a[0].length);
const MULTI_RE = new RegExp(`(?<![a-z])(${MULTI.map(([fr]) => fr.replace(/[- ]/g, "[- ]+")).join("|")})(?![a-z])`, "g");
const MULTI_MAP = new Map(MULTI.map(([fr, en]) => [fr.replace(/[- ]/g, ""), en]));

// A name in (mostly) English words: French phrases and words are swapped for
// their English, anything unknown is kept as written.
function toEnglish(name) {
  const text = fold(String(name || "").replace(/\([^)]*\)/g, " "))
    .replace(/['’]/g, " ")
    .replace(MULTI_RE, (m) => ` ${MULTI_MAP.get(m.replace(/[- ]/g, "")) || m} `)
    .replace(/\b(\d+)\s*%/g, " ");
  return text
    .split(/[^a-z0-9-]+/)
    .filter((w) => w && !LITTLE.has(w) && !/^\d/.test(w))
    .map((w) => WORD_MAP.get(w) || WORD_MAP.get(w.replace(/[sx]$/, "")) || w)
    .join(" ");
}

// Words that say how a food is sold or kept, never which food it is.
const DESCRIPTORS = new Set(
  (
    "whole skim nonfat fat-free low-fat reduced-fat unsalted salted boneless skinless bone-in skin-on lean extra-lean extra-virgin virgin " +
    "organic bio plain natural regular low-sodium sodium-free no-salt-added light homemade store-bought bell mild moulu moulue moulus moulues"
  ).split(" ")
);
// What a food was made into: not the food itself.
const DERIVED = { broth: "stock", stock: "stock", bouillon: "stock", consomme: "stock", base: "stock", powder: "powder", paste: "paste", sauce: "sauce", juice: "juice", extract: "extract", zest: "zest", puree: "puree", seasoning: "seasoning", dressing: "dressing", syrup: "syrup" };
// Cuts of meat and fish.
const CUTS = new Set(
  "breast thigh leg drumstick wing fillet tenderloin loin chop rib roast steak ground shoulder belly shank brisket sirloin flank cutlet strip mince minced".split(" ")
);
// Colours and varieties: they only separate two foods when both names give one.
const KINDS = new Set(
  "red yellow white green black brown purple golden basmati jasmine arborio sushi greek roma cherry grape plum yukon russet gold baby english field vine heirloom haas hass california sweet vidalia spanish italian flat-leaf curly savoy napa cortland mcintosh gala honeycrisp".split(" ")
);
// Two-word foods a colour or variety word belongs to.
const COMPOUNDS = [
  ["green onion", "scallion"], ["spring onion", "scallion"], ["green bean", "greenbean"], ["black bean", "blackbean"], ["kidney bean", "kidneybean"],
  ["sweet potato", "sweetpotato"], ["red pepper flake", "chiliflake"], ["sour cream", "sourcream"], ["cream cheese", "creamcheese"], ["ice cream", "icecream"],
  ["coconut milk", "coconutmilk"], ["peanut butter", "peanutbutter"], ["maple syrup", "maplesyrup"],
];
// Words that only say what kind of thing it is ("pita bread" is pita).
const GENERIC = new Set(["bread", "cheese"]);
const STAPLES = new Set([...STAPLE_WORDS, ...SPICE_WORDS].map((w) => canonicalize(w).core));

const profileCache = new Map();

// Everything the matching needs to know about one name.
export function foodProfile(name) {
  const key = String(name || "");
  if (profileCache.has(key)) return profileCache.get(key);

  let core = canonicalize(toEnglish(key)).core;
  // A bell pepper is a vegetable; plain pepper is the spice.
  const bell = core.split(" ").includes("bell");
  const words0 = core.split(" ").filter((w) => w && !DESCRIPTORS.has(w) && !LITTLE.has(w));
  core = words0.join(" ");
  const staple = !bell && (STAPLES.has(core) || STAPLES.has(canonicalize(core).core) || STAPLES.has(familyKey(core)));
  let joined = ` ${core} `;
  for (const [phrase, token] of COMPOUNDS) joined = joined.replace(` ${phrase} `, ` ${token} `);
  const words = joined.trim().split(" ").filter(Boolean);

  let derived = null;
  const cuts = new Set();
  const kinds = new Set();
  let base = [];
  for (const w of words) {
    if (DERIVED[w]) derived = DERIVED[w];
    else if (CUTS.has(w)) cuts.add(w === "minced" || w === "mince" ? "ground" : w);
    else if (KINDS.has(w)) kinds.add(w);
    else base.push(w);
  }
  // "cherry" alone is the fruit, "greek" alone is still a word: keep a kind word
  // when it is all there is.
  if (base.length === 0 && kinds.size > 0 && cuts.size === 0) {
    base = [...kinds];
    kinds.clear();
  }
  if (base.length > 1) base = base.filter((w) => !GENERIC.has(w));
  // A cut on its own ("flank steak", "sirloin") is still a meat.
  if (base.length === 0) {
    const fam = familyKey(words.join(" "));
    base = fam && fam !== words.join(" ") ? [fam] : [...cuts].map((c) => familyKey(c));
  }
  // Chicken is chicken whatever else the name says ("rotisserie chicken").
  const family = familyKey(base.join(" "));
  const food = family !== base.join(" ") ? family : [...base].sort().join(" ");

  const profile = { core, food, derived, cuts, kinds, staple };
  profileCache.set(key, profile);
  return profile;
}

const overlaps = (a, b) => a.size === 0 || b.size === 0 || [...a].some((x) => b.has(x));

// Whether something you have (an Inventory item or a staple's name) is this
// recipe ingredient.
export function itemCovers(haveName, ingredientName) {
  const have = foodProfile(haveName);
  const want = foodProfile(ingredientName);
  if (!have.food || !want.food) return false;
  if (have.staple !== want.staple) return false;
  if (have.derived !== want.derived) return false;
  if (have.food !== want.food) return false;
  return overlaps(have.cuts, want.cuts) && overlaps(have.kinds, want.kinds);
}

// Whether an ingredient is something you always have: one of the app's pantry
// staples (salt, oil, flour, spices...) unless you took it off, or anything you
// marked as a pantry staple.
export function isStapleIngredient(name, customStaples = [], excludedStaples = []) {
  const p = foodProfile(name);
  const own = new Set((customStaples || []).map((s) => String(s).trim().toLowerCase()));
  const off = new Set((excludedStaples || []).map((s) => String(s).trim().toLowerCase()));
  const raw = String(name || "").trim().toLowerCase();
  const keys = [raw, canonicalize(raw).core, p.core];
  if (keys.some((k) => own.has(k)) || [...own].some((s) => itemCovers(s, name))) return true;
  if (keys.some((k) => off.has(k))) return false;
  if (p.staple) return true;
  // "Salt and pepper", « sel et poivre, au goût »: staples written on one line.
  const parts = raw.split(/\s*(?:,|&|\band\b|\bet\b)\s*/).filter((part) => foodProfile(part).core);
  return parts.length > 1 && parts.every((part) => isStapleIngredient(part, customStaples, excludedStaples));
}

const isUsable = (item) => !item.isLeftover;
const notExpired = (item) => !item.expiresAt || daysUntil(item.expiresAt) >= 0;

// The Inventory items that are this ingredient, the one to use first first:
// still good before past its date, then the soonest use-by date, then the oldest.
export function matchingItems(ingredientName, inventory = []) {
  const time = (d) => (d ? new Date(d).getTime() : Infinity);
  return inventory
    .filter((item) => isUsable(item) && itemCovers(item.name, ingredientName))
    .sort(
      (a, b) =>
        Number(notExpired(b)) - Number(notExpired(a)) ||
        time(a.expiresAt) - time(b.expiresAt) ||
        time(a.purchasedAt || a.createdAt) - time(b.purchasedAt || b.createdAt)
    );
}

// The first item still good that is this ingredient: what the blue ✓ shows.
export function haveItemFor(ingredientName, inventory = []) {
  return matchingItems(ingredientName, inventory).find(notExpired) || null;
}

// ---- A recipe next to your Inventory -------------------------------------------
//
// `kitchen` is what App.jsx keeps once: { inventory, customStaples, excludedStaples }.

const NO_ITEMS = [];
// The answers for one Inventory, kept until it, the staples or the day change.
const answers = new WeakMap();

function answersFor(kitchen) {
  const inventory = kitchen?.inventory || NO_ITEMS;
  const day = new Date().toDateString();
  let table = answers.get(inventory);
  if (!table || table.day !== day || table.customStaples !== kitchen?.customStaples || table.excludedStaples !== kitchen?.excludedStaples) {
    table = { day, customStaples: kitchen?.customStaples, excludedStaples: kitchen?.excludedStaples, byName: new Map() };
    answers.set(inventory, table);
  }
  return table;
}

// Where one ingredient stands: "staple" (always have: salt, oil, spices, your own
// pantry staples), "have" (an Inventory item still good is this ingredient) or
// "need". What the recipe card's ✓ beside each ingredient shows.
export function ingredientHave(name, kitchen) {
  const table = answersFor(kitchen);
  if (!table.byName.has(name)) {
    const staple = isStapleIngredient(name, kitchen?.customStaples, kitchen?.excludedStaples);
    table.byName.set(name, staple ? "staple" : haveItemFor(name, kitchen?.inventory || NO_ITEMS) ? "have" : "need");
  }
  return table.byName.get(name);
}

// Two ingredients of one recipe are the same food when each covers the other:
// "garlic cloves" and "minced garlic" are, chicken thighs and chicken breasts are not.
function sameFood(a, b) {
  if (itemCovers(a, b) && itemCovers(b, a)) return true;
  return !foodProfile(a).food && !foodProfile(b).food && fold(a).trim() === fold(b).trim();
}

// A recipe next to your Inventory, the one count every page shows ("3/5",
// "2 missing", "2 things to buy", Ready now). One line per food, in the recipe's
// order, named as the recipe first writes it (a missing line, as it writes the
// missing ingredient); staples are left out (you always have them). A line is
// had when every ingredient in it is.
//   have, buy     [{ key, name }]
//   missing       the names in `buy`
//   totalCount, matchedCount, missingCount
export function recipeHave(recipe, kitchen) {
  const lines = [];
  for (const ing of recipe?.ingredients || []) {
    const name = String(ing?.name || "").trim();
    if (!name) continue;
    const status = ingredientHave(name, kitchen);
    if (status === "staple") continue;
    const line = lines.find((l) => sameFood(l.written, name));
    if (!line) lines.push({ written: name, had: status === "have", missingName: status === "have" ? null : name });
    else if (status !== "have" && line.had) Object.assign(line, { had: false, missingName: name });
  }
  const item = (l) => ({ key: l.written.toLowerCase(), name: capitalize(l.missingName || l.written) });
  const have = lines.filter((l) => l.had).map(item);
  const buy = lines.filter((l) => !l.had).map(item);
  return {
    have,
    buy,
    missing: buy.map((i) => i.name),
    totalCount: lines.length,
    matchedCount: have.length,
    missingCount: buy.length,
  };
}

// Whether a recipe uses an Inventory item (Cook with, "uses expiring"). A staple
// you keep, like paprika, is also found by its name inside the recipe's
// ("smoked paprika").
export function recipeUsesItem(recipe, itemName) {
  const staple = foodProfile(itemName).staple;
  const written = fold(itemName).trim();
  return (recipe?.ingredients || []).some(
    (ing) => ing?.name && (itemCovers(itemName, ing.name) || (staple && written !== "" && fold(ing.name).includes(written)))
  );
}

// One key per food, for lists that show each food once (Cook with's shelves and
// its expiring strip): « Poulet » and "Chicken" are one.
export function foodKey(name) {
  const p = foodProfile(name);
  if (!p.food) return `~${fold(name).trim()}`;
  return [p.food, p.derived || "", [...p.cuts].sort().join("+"), [...p.kinds].sort().join("+")].join("|");
}

// Inventory items still good that go off within `withinDays` days, soonest first.
// Leftovers are a meal, not an ingredient, and are left out.
export function expiringSoon(inventory = [], withinDays) {
  return inventory
    .filter((item) => isUsable(item) && item.expiresAt && daysUntil(item.expiresAt) >= 0 && daysUntil(item.expiresAt) <= withinDays)
    .sort((a, b) => daysUntil(a.expiresAt) - daysUntil(b.expiresAt));
}

// The app's "uses expiring" rule (the recipe card's "use soon", the Makeable
// card's pink strip, the Recipes count): the items going off within `withinDays`
// days that this recipe uses and no other planned meal uses already, soonest
// first. Staples (salt, oil, spices) don't count.
export function expiringItemsIn(recipe, inventory, plannerEntries = [], allRecipes = [], withinDays = 3) {
  const soon = expiringSoon(inventory, withinDays).filter((item) => !foodProfile(item.name).staple && recipeUsesItem(recipe, item.name));
  if (soon.length === 0) return soon;
  const byId = new Map(allRecipes.map((r) => [r.id, r]));
  const others = [];
  for (const entry of plannerEntries) {
    if (entry.isLeftover || entry.alreadyHave) continue;
    const other = byId.get(entry.recipeId) || entry.recipe;
    if (other && other.id !== recipe.id && !other.isPlaceholder) others.push(other);
  }
  return soon.filter((item) => !others.some((other) => recipeUsesItem(other, item.name)));
}

// A count is a count: "", "unit", "piece" and "each" are the same unit.
function unitKey(unit) {
  const u = canonicalUnit(unit || "");
  return u === "unit" || u === "piece" ? "" : u;
}

// `qty` of `fromUnit` in `toUnit`, or null when one can't be turned into the
// other (a clove of garlic is not a head; a cup of rice is not grams).
export function convertAmount(qty, fromUnit, toUnit) {
  if (qty == null || !Number.isFinite(Number(qty))) return null;
  let q = Number(qty);
  let from = unitKey(fromUnit);
  let to = unitKey(toUnit);
  if (from === "dozen") [q, from] = [q * 12, ""];
  if (to === "dozen") return from === "" ? q / 12 : null;
  if (from === to) return q;
  if (!from || !to) return null;
  return convertToUnit(q, from, to);
}

// Amounts in grams and millilitres are whole numbers; others keep two decimals.
export function roundAmount(qty, unit) {
  if (qty == null) return null;
  const whole = ["g", "ml"].includes(unitKey(unit));
  return whole ? Math.round(qty) : Math.round(qty * 100) / 100;
}

// The "Take out of your Inventory" list for a meal cooked for `servings`.
// Rows, in the recipe's order:
//   { key, kind: "item", item, names, amount, ask, on, staple, before, after }
//     An Inventory item and how much comes out, in the item's own unit. `ask`
//     when that can't be worked out (the units don't convert, the recipe gives
//     no amount, or the item has none): the row then waits for an amount and
//     starts switched off. A staple you keep in Inventory starts switched off.
//     When one item doesn't hold enough, the rest comes from the next one.
//   { key, kind: "missing", names, on: false }  not in your Inventory
//   { key, kind: "staple", names, on: false }   an "always have" not in Inventory
export function buildTakeOut({ recipe, servings, inventory = [], customStaples = [], excludedStaples = [] }) {
  const base = recipe?.baseServings || 1;
  const scale = (servings || base) / base;
  const left = new Map(inventory.map((item) => [item.id, item.quantity]));
  const byItem = new Map();
  const others = new Map();
  const order = [];

  for (const ing of recipe?.ingredients || []) {
    if (!ing?.name) continue;
    const staple = isStapleIngredient(ing.name, customStaples, excludedStaples);
    const items = matchingItems(ing.name, inventory);
    const qty = ing.quantity != null ? ing.quantity * scale : null;

    if (items.length === 0) {
      const kind = staple ? "staple" : "missing";
      const key = `${kind}:${foodProfile(ing.name).core || ing.name.toLowerCase()}`;
      if (!others.has(key)) {
        others.set(key, { key, kind, names: [], on: false });
        order.push(key);
      }
      if (!others.get(key).names.includes(ing.name)) others.get(key).names.push(ing.name);
      continue;
    }

    // Take what the recipe uses from the first item, and any rest from the next
    // ones that can hold it.
    let need = qty;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const key = `item:${item.id}`;
      let row = byItem.get(key);
      if (row && !row.names.includes(ing.name)) row.names.push(ing.name);
      if (!row) {
        if (i > 0 && (need == null || need <= 0)) break;
        row = { key, kind: "item", item, names: [ing.name], amount: 0, ask: false, staple, on: !staple, before: item.quantity ?? null };
        byItem.set(key, row);
        order.push(key);
      }
      row.staple = row.staple && staple;
      const inItemUnit = convertAmount(need, ing.unit, item.unit);
      if (inItemUnit == null || item.quantity == null) {
        row.ask = true;
        break;
      }
      const available = left.get(item.id) ?? 0;
      const take = Math.min(inItemUnit, available);
      row.amount += take;
      left.set(item.id, available - take);
      const rest = inItemUnit - take;
      if (rest <= 1e-9) break;
      // What is still needed, back in the recipe's unit, for the next item.
      need = need * (rest / inItemUnit);
      if (i === items.length - 1) break;
    }
  }

  return order.map((key) => {
    const row = byItem.get(key) || others.get(key);
    if (row.kind !== "item") return row;
    if (row.ask) return { ...row, amount: null, on: false, after: null };
    const amount = roundAmount(row.amount, row.item.unit);
    const after = row.before == null ? null : roundAmount(Math.max(0, row.before - amount), row.item.unit);
    return { ...row, amount, after, on: row.on && amount > 0 };
  });
}

import { core, findSaleDeal } from "./similarRecipes.js";
import { daysUntil } from "./pantryInventory.js";
import { capitalize } from "./groceryList.js";
import { dealSavings } from "./flyerIngredients.js";
import { PROTEINS, recipeUsesProtein } from "./proteins.js";
import { inMealGroup, isMakeableMeal, makeableRuleOn, recipeSlot, recipeTotalMinutes } from "./mealSlots.js";
import { matchesSearch } from "./recipeSearch.js";

// The logic behind the shared recipe finder (components/Finder.jsx): the
// Planner's bottom panel and the phone's bottom card use it today, Makeable
// next. Plain functions so they can be tested without a browser. The ranking
// itself stays in lib/plannerSuggestions.js (rankRecipesForTray) and what is
// on hand in lib/onHand.js; this file filters, groups and words what they give.

// "Expiring soon" looks a week ahead, like the Planner's own ranking.
export const EXPIRING_DAYS = 7;
// "Quick" is half an hour or less, prep and cook together.
export const QUICK_MINUTES = 30;
// At most this many shared ingredients are named on a card ("shares chicken,
// lemon and spinach"); more than that is a count ("shares 4 ingredients").
export const NAME_SHARED_UP_TO = 3;

export const AVAILABILITY = ["all", "ready", "few"];

// ---- Ingredient groups (Main meal) -----------------------------------------

export const CATEGORY_ORDER = ["protein", "produce", "dairy", "pantry"];

// Whole words, English and French, accents folded away. Anything that is none
// of the three lists is a pantry ingredient (pasta, rice, flour, spices, oil).
const DAIRY = /\b(milk|lait|cream|creme|butter|beurre|cheese|fromage|cheddar|mozzarella|parmesan|parmigiano|feta|ricotta|brie|gouda|yogh?urt|yogourt|babeurre|buttermilk|kefir|cottage|mascarpone)\b/;
const PROTEIN_EXTRA = /\b(eggs?|oeufs?|tofu|tempeh|lentils?|lentilles?|chickpeas?|pois chiches?|beans?|haricots?|edamame|sausages?|saucisses?|bacon|ham|jambon|meatballs?|boulettes|veal|veau)\b/;
const PRODUCE = /\b(onions?|oignons?|garlic|ail|tomato(es)?|tomates?|potato(es)?|patates?|pommes de terre|carrots?|carottes?|celery|celeri|spinach|epinards?|lettuce|laitue|kale|chou|cabbage|broccoli|brocoli|cauliflower|chou-fleur|peppers?|poivrons?|cucumbers?|concombres?|zucchini|courgettes?|squash|courges?|mushrooms?|champignons?|corn|mais|lemons?|citrons?|limes?|oranges?|apples?|pommes?|bananas?|bananes?|avocados?|avocats?|ginger|gingembre|herbs?|herbes?|cilantro|coriandre|parsley|persil|basil|basilic|thyme|thym|rosemary|romarin|mint|menthe|dill|aneth|scallions?|shallots?|echalotes?|leeks?|poireaux?|asparagus|asperges?|eggplants?|aubergines?|beets?|betteraves?|peas|pois|berries|fraises?|bleuets?|framboises?|mango|mangue|pineapple|ananas|grapes?|raisins|jalapenos?|chil[ei]s?|piments?|radish|radis|arugula|roquette|sprouts|fennel|fenouil)\b/;

function fold(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// protein, produce, dairy or pantry, for one ingredient name.
export function categoryOf(name) {
  const text = fold(name);
  if (PROTEINS.some((p) => p.terms.some((term) => text.includes(fold(term)))) || PROTEIN_EXTRA.test(text)) return "protein";
  if (DAIRY.test(text)) return "dairy";
  if (PRODUCE.test(text)) return "produce";
  return "pantry";
}

// A recipe's ingredients as written, once per core (staples are left out, like
// everywhere else), in the order the recipe lists them.
export function recipeIngredientNames(recipe) {
  const seen = new Set();
  const out = [];
  for (const ing of recipe.ingredients || []) {
    const c = core(ing.name);
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push({ core: c, name: capitalize(String(ing.name).trim()) });
  }
  return out;
}

// [{ id: "protein", items: [{ core, name }] }, ...] in the order protein,
// produce, dairy, pantry; an empty group is left out.
export function groupIngredients(recipe) {
  const groups = new Map(CATEGORY_ORDER.map((id) => [id, []]));
  for (const item of recipeIngredientNames(recipe)) groups.get(categoryOf(item.name)).push(item);
  return CATEGORY_ORDER.map((id) => ({ id, items: groups.get(id) })).filter((g) => g.items.length > 0);
}

// ---- Cook with: expiring items and shelves ----------------------------------

// What an Inventory item is called when picking it in Cook with: its ingredient
// core, or, for a staple (salt, most spices - the app never matches recipes on
// those), its name as text with a "~" in front, matched against ingredient
// names instead.
function itemKey(item) {
  return core(item.name) || `~${fold(item.name).trim()}`;
}

// Items going off within `within` days (not already gone), soonest first, one
// per ingredient: [{ key, name, days, item }].
export function expiringItems(pantryInventory, within = EXPIRING_DAYS) {
  const seen = new Set();
  return pantryInventory
    .filter((item) => item.expiresAt && daysUntil(item.expiresAt) >= 0 && daysUntil(item.expiresAt) <= within)
    .sort((a, b) => daysUntil(a.expiresAt) - daysUntil(b.expiresAt))
    .filter((item) => {
      const key = itemKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => ({ key: itemKey(item), name: capitalize(String(item.name).trim()), days: daysUntil(item.expiresAt), item }));
}

// The colour of a shelf's name pill. The three built-in shelves have their own;
// the user's own shelves take the others in turn, in the order they sit on the
// Inventory page.
const CUSTOM_TONES = ["spice", "baking"];
export function shelfTone(sectionId, customIndex) {
  if (sectionId === "fridge" || sectionId === "freezer" || sectionId === "pantry") return sectionId;
  return CUSTOM_TONES[customIndex % CUSTOM_TONES.length];
}

// The user's own Inventory shelves, in the order and under the names they gave
// them (Fridge, Freezer, Pantry and any custom shelf), each with the items on
// it: [{ id, label, tone, items: [{ key, name, item }] }]. `sections` is what
// orderedSections() in Inventory.jsx gives: [{ id, label, custom }], in the
// saved order. A shelf with nothing on it is left out, and so is anything
// already past its use-by date.
export function shelvesWithItems(pantryInventory, sections) {
  const usable = pantryInventory.filter((item) => !item.expiresAt || daysUntil(item.expiresAt) >= 0);
  let custom = 0;
  return sections
    .map((section) => {
      const tone = shelfTone(section.id, section.custom ? custom : 0);
      if (section.custom) custom += 1;
      const seen = new Set();
      const items = usable
        .filter((item) => item.location === section.id)
        .filter((item) => {
          const key = itemKey(item);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((item) => ({ key: itemKey(item), name: capitalize(String(item.name).trim()), item }));
      return { id: section.id, label: section.label, tone, items };
    })
    .filter((shelf) => shelf.items.length > 0);
}

// "Spinach, Onion" -> a filter on the search text, for the picker's own search.
export function matchesIngredientSearch(name, query) {
  const q = fold(query).trim();
  return !q || fold(name).includes(q);
}

// ---- Results ----------------------------------------------------------------

// The day a recipe is planned on (0 = Monday), the soonest, or null. Leftovers
// don't count: they are the same meal eaten again.
export function plannedDayOf(recipeId, entries) {
  const days = entries
    .filter((e) => e.recipe?.id === recipeId && !e.isLeftover)
    .map((e) => [e.weekStart || "", e.dayOfWeek])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
  return days.length ? days[0][1] : null;
}

// What a recipe is next to the kitchen, from rankRecipesForTray's entry: nothing
// to buy, one or two to buy, or more.
export function availabilityOf(stats) {
  if (stats.totalCount > 0 && stats.missingCount === 0) return "ready";
  if (stats.totalCount > 0 && stats.missingCount <= 2) return "few";
  return "shop";
}

// The Cook with picks a recipe uses: ingredient cores it has, and staple picks
// ("~paprika") that appear in one of its ingredient names.
function pickedBy(x, picks) {
  if (picks.size === 0) return [];
  const picked = x.cores.filter((c) => picks.has(c));
  const names = (x.recipe.ingredients || []).map((i) => fold(i.name));
  for (const key of picks) if (key.startsWith("~") && names.some((n) => n.includes(key.slice(1)))) picked.push(key);
  return picked;
}

function usesAny(x, cores) {
  return cores.size > 0 && x.cores.some((c) => cores.has(c));
}

// Narrows the ranked recipes by everything the finder can filter on and sorts
// them. `filters`: query, meal ("all", "meals" or a recipe slot id), protein (a
// protein id or ""), quick, expiring, picks (a Set of ingredient cores to cook
// with), base (the Main meal's cores still switched on, or null), baseId,
// includeSides (the Makeable now rule, see isMakeableMeal: "ready" leaves out
// sides, desserts and pantry prep unless it is on).
// Returns { tiles, counts }: counts is how many the three availability choices
// would show with every other filter kept. Each tile is the ranked entry plus
// `shared` (cores shared with the Main meal) and `picked` (cores from Cook with).
export function findRecipes(ranked, filters, expiringCores) {
  const { query = "", meal = "all", protein = "", quick = false, expiring = false, picks = new Set(), base = null, baseId = null, includeSides = false } = filters;
  const ruleOn = makeableRuleOn(includeSides, meal);
  const isReady = (x) => availabilityOf(x.stats) === "ready" && (!ruleOn || isMakeableMeal(x.recipe));
  const kind = PROTEINS.find((p) => p.id === protein) || null;
  const searching = query.trim() !== "";

  const beforeAvailability = ranked
    .filter((x) => x.recipe.id !== baseId)
    .filter((x) => !searching || matchesSearch(x.recipe, query))
    .filter((x) => meal === "all" || (meal === "meals" ? inMealGroup(x.recipe, "meals") : recipeSlot(x.recipe) === meal))
    .filter((x) => !kind || recipeUsesProtein(x.recipe, kind))
    .filter((x) => !quick || (recipeTotalMinutes(x.recipe) > 0 && recipeTotalMinutes(x.recipe) <= QUICK_MINUTES))
    .filter((x) => !expiring || usesAny(x, expiringCores))
    .map((x) => ({
      ...x,
      picked: pickedBy(x, picks),
      shared: base ? x.cores.filter((c) => base.has(c)) : [],
    }))
    .filter((x) => picks.size === 0 || x.picked.length > 0)
    .filter((x) => !base || x.shared.length > 0);

  const counts = { all: beforeAvailability.length, ready: 0, few: 0 };
  for (const x of beforeAvailability) {
    const a = availabilityOf(x.stats);
    if (isReady(x)) counts.ready += 1;
    if (a === "few") counts.few += 1;
  }

  const wanted = (x) => {
    const a = availabilityOf(x.stats);
    return filters.avail === "ready" ? isReady(x) : filters.avail === "few" ? a === "few" : true;
  };
  const tiles = beforeAvailability.filter(wanted);

  // Cook with and Main meal put the most shared first; otherwise the ranking
  // (expiring food used, little to buy) already says what to show first.
  if (base) tiles.sort((a, b) => b.shared.length - a.shared.length || b.score - a.score);
  else if (picks.size > 0) tiles.sort((a, b) => b.picked.length - a.picked.length || b.score - a.score);
  return { tiles, counts };
}

// ---- The pop-out: what you have, what to buy ----------------------------------

// A recipe's ingredients split into what is on hand and what is not:
// { have: [{ core, name }], buy: [{ core, name }] }.
export function haveAndBuy(recipe, haveCores) {
  const have = [];
  const buy = [];
  for (const item of recipeIngredientNames(recipe)) (haveCores.has(item.core) ? have : buy).push(item);
  return { have, buy };
}

// The real flyer deal for an ingredient, as the green pill's parts, or null
// when nothing is really on sale (same matching as Home, Recipes and Makeable:
// findSaleDeal, then dealSavings for the percentage).
export function saleFor(name, deals) {
  const deal = findSaleDeal(name, deals || []);
  if (!deal) return null;
  const saving = dealSavings(deal);
  return { deal, percent: saving?.pct != null ? saving.pct * 100 : null, store: deal.store, price: deal.price };
}

// The names a card says it shares: "chicken, lemon and spinach" is built by the
// caller with formatList; this only picks the words or says it is a count.
export function sharedWords(cores, nameOf) {
  if (cores.length === 0) return { names: [], count: 0 };
  return cores.length <= NAME_SHARED_UP_TO
    ? { names: cores.map(nameOf), count: cores.length }
    : { names: [], count: cores.length };
}

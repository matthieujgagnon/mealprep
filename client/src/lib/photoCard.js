import { availabilityOf, categoryOf, expiringItems } from "./finder.js";
import { core, findExpiringSoonInRecipe } from "./similarRecipes.js";
import { formatRecipeTime } from "./mealSlots.js";

// The logic behind the two photo cards (components/RecipePhotoCard.jsx, the
// Recipes card in Recipes.jsx and MakeableCard.jsx). Design:
// docs/design/riso-v2-recipe-cards/. Plain functions so they can be tested
// without a browser.

// The thin line at the bottom of a Recipes card: supper blue, lunch pink,
// breakfast yellow. Any other kind of recipe (sides, desserts, prep) has none.
const MEAL_LINE = { dinner: "var(--riso-accent)", lunch: "var(--riso-hot)", breakfast: "var(--riso-yellow)" };
export function mealLineColor(slot) {
  return MEAL_LINE[slot] || null;
}

// "35 MIN", "4 H", "1 H 15 MIN": the caption's time, or "" when there is none.
export function captionTime(minutes) {
  return (formatRecipeTime(minutes) || "").toUpperCase();
}

// ---- Makeable card: the missing-ingredient pills ------------------------------

// A card shows at most this many pills; the rest are a "+N" pill that opens the recipe.
export const MAX_PILLS = 4;

// The missing ingredients (names as the recipe writes them) as the card's two
// columns: proteins on the left, everything else on the right. A recipe with
// no protein puts everything in the left column and leaves the right one empty.
// When there are more than MAX_PILLS, proteins are kept first, then the rest in
// the recipe's order; `more` counts the ones left out. Each pill keeps its name.
export function pickPills(names, max = MAX_PILLS) {
  const items = names.map((name) => ({ name, protein: categoryOf(name) === "protein" }));
  const proteins = items.filter((i) => i.protein);
  const others = items.filter((i) => !i.protein);
  const keepProteins = proteins.slice(0, max);
  const keepOthers = others.slice(0, max - keepProteins.length);
  const more = items.length - keepProteins.length - keepOthers.length;
  return proteins.length > 0
    ? { left: keepProteins, right: keepOthers, more }
    : { left: keepOthers, right: [], more };
}

// A pill's text size by the length of its name, in px: a long name (« gingembre »,
// « anis étoilé ») gets smaller instead of being cut.
export function pillFontSize(name) {
  const length = [...String(name)].length;
  return length >= 9 ? 10.5 : length === 8 ? 12 : 13;
}

// ---- Makeable card: the buttons ----------------------------------------------

// Which two buttons a card shows, first one first, by what the recipe needs:
//   ready  Cook (main) + Plan
//   few    To buy (main) + Plan
//   shop   Plan (main) + To buy: it cannot be cooked yet, so no Cook
// `tone` is "main" (blue) or "plain" (white); To buy turns green by itself once
// everything is on the grocery list.
export function cardButtons(state) {
  if (state === "ready") return [{ id: "cook", tone: "main" }, { id: "plan", tone: "plain" }];
  if (state === "few") return [{ id: "buy", tone: "main" }, { id: "plan", tone: "plain" }];
  return [{ id: "plan", tone: "main" }, { id: "buy", tone: "plain" }];
}

export function cardState(stats) {
  return availabilityOf(stats);
}

// ---- Makeable card: the pink "use soon" strip --------------------------------

// The strip shows only when something the recipe uses expires in this many days or fewer.
export const USE_SOON_DAYS = 3;

// The soonest Inventory item this recipe uses that goes off within USE_SOON_DAYS,
// as { name, days }, or null. It follows the app's "uses expiring" rule: food that
// another planned meal already uses doesn't count (findExpiringSoonInRecipe).
export function soonItemFor(recipe, pantryInventory, plannedEntries, recipes) {
  const soon = findExpiringSoonInRecipe(recipe, pantryInventory, plannedEntries, recipes, USE_SOON_DAYS);
  if (soon.size === 0) return null;
  const item = expiringItems(pantryInventory, USE_SOON_DAYS).find((i) => soon.has(core(i.name)));
  return item ? { name: item.name, days: item.days } : null;
}

// ---- Makeable card: sales and the grocery list --------------------------------

// How many of the missing ingredients are on sale: `saleOf(name)` is
// finder.saleFor(name, deals), or null when nothing is really on sale.
export function saleCount(names, saleOf) {
  return names.filter((name) => saleOf(name)).length;
}

// The names the To buy button adds: what is not on the list yet. Undo takes
// off exactly these, so an item that was already there stays.
export function namesToAdd(names, isOnList) {
  return names.filter((name) => !isOnList(name));
}

import { core, recipeCores } from "./similarRecipes.js";
import { daysUntil } from "./pantryInventory.js";
import { capitalize } from "./groceryList.js";
import { recipeHaveStats } from "./onHand.js";
import { isNoteEntry } from "./plannerSlots.js";
import { recipeSlot } from "./mealSlots.js";

// The planner looks a week ahead, so "expiring" here is anything going off
// within 7 days - wider than the 3-day "use soon" line elsewhere.
const EXPIRING_WITHIN_DAYS = 7;

export function isBreakfastRecipe(recipe) {
  return recipeSlot(recipe) === "breakfast";
}

// Pantry / Prep recipes (pickles, sauces, roasted veg) never fill a meal.
export function isPrepRecipe(recipe) {
  return recipeSlot(recipe) === "prep";
}

// Sides go with a meal; they never fill a meal slot on their own.
export function isSideRecipe(recipe) {
  return recipeSlot(recipe) === "side";
}

// Desserts, like sides, never fill a meal slot on their own.
export function isDessertRecipe(recipe) {
  return recipeSlot(recipe) === "dessert";
}

// Ingredients are matched by their core ("poi chich") but shown as the
// kitchen or the recipe writes them ("Pois chiches").
function namesAsWritten(pantryInventory, recipes) {
  const names = new Map();
  const add = (name) => {
    const c = core(name);
    if (c && !names.has(c)) names.set(c, capitalize(String(name).trim()));
  };
  for (const item of pantryInventory) add(item.name);
  for (const r of recipes) for (const ing of r.ingredients || []) add(ing.name);
  return (c) => names.get(c) || capitalize(c);
}

// Ranks every recipe for the finder. `upcomingEntries` are this week's
// placements from today on - what "already in a meal" means for expiring
// food, and what "shared with the week" counts against.
export function rankRecipesForTray({ recipes, upcomingEntries, pantryInventory, haveCores }) {
  const expiring = pantryInventory
    .filter((item) => item.expiresAt && daysUntil(item.expiresAt) >= 0 && daysUntil(item.expiresAt) <= EXPIRING_WITHIN_DAYS)
    .sort((a, b) => daysUntil(a.expiresAt) - daysUntil(b.expiresAt));
  const expiringCores = [...new Set(expiring.map((i) => core(i.name)).filter(Boolean))];

  const planned = upcomingEntries.filter((e) => !isNoteEntry(e) && e.recipe);
  const plannedIds = new Set(planned.map((e) => e.recipe.id));
  const plannedCoreCounts = new Map();
  for (const e of planned) {
    for (const c of recipeCores(e.recipe)) plannedCoreCounts.set(c, (plannedCoreCounts.get(c) || 0) + 1);
  }

  // Expiring food that no upcoming meal uses yet is what the finder should
  // push; once everything expiring is in a meal, fall back to all of it.
  const unusedExpiring = expiringCores.filter((c) => !plannedCoreCounts.has(c));
  const expiringFocus = new Set(unusedExpiring.length > 0 ? unusedExpiring : expiringCores);

  const ranked = recipes
    .filter((r) => !r.isPlaceholder)
    .map((recipe) => {
      const cores = [...recipeCores(recipe)];
      const stats = recipeHaveStats(recipe, haveCores);
      const expUsed = cores.filter((c) => expiringFocus.has(c));
      const sharedCount = cores.filter((c) => plannedCoreCounts.has(c)).length;
      const score =
        expUsed.length * 2 +
        (stats.missingCount > 0 ? -stats.missingCount * 0.5 : 2) +
        sharedCount * 0.5 -
        (plannedIds.has(recipe.id) ? 1.5 : 0);
      return { recipe, cores, stats, expUsed, sharedCount, score };
    })
    .sort((a, b) => b.score - a.score || a.recipe.title.localeCompare(b.recipe.title));

  const nameOf = namesAsWritten(pantryInventory, recipes);
  for (const x of ranked) x.nameOf = nameOf;
  return { ranked, expiringCores, unusedExpiringCores: unusedExpiring, nameOf };
}

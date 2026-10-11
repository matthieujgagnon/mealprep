import { core, recipeCores } from "./similarRecipes.js";
import { capitalize } from "./groceryList.js";
import { expiringSoon, foodProfile, recipeHave, recipeUsesItem } from "./inventoryMatch.js";
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

// A shared ingredient is found by its core ("poi chich") but shown as a recipe
// writes it ("Pois chiches").
function namesAsWritten(recipes) {
  const names = new Map();
  for (const r of recipes) {
    for (const ing of r.ingredients || []) {
      const c = core(ing.name);
      if (c && !names.has(c)) names.set(c, capitalize(String(ing.name).trim()));
    }
  }
  return (c) => names.get(c) || capitalize(c);
}

// Ranks every recipe for the finder. `upcomingEntries` are this week's
// placements from today on - what "already in a meal" means for expiring
// food, and what "shared with the week" counts against. `kitchen` is App's
// { inventory, customStaples, excludedStaples }: what is on hand comes from
// lib/inventoryMatch.js (recipeHave), like every other page.
export function rankRecipesForTray({ recipes, upcomingEntries, kitchen }) {
  const expiring = expiringSoon(kitchen?.inventory || [], EXPIRING_WITHIN_DAYS).filter((item) => !foodProfile(item.name).staple);

  const planned = upcomingEntries.filter((e) => !isNoteEntry(e) && e.recipe);
  const plannedIds = new Set(planned.map((e) => e.recipe.id));
  const plannedCoreCounts = new Map();
  for (const e of planned) {
    for (const c of recipeCores(e.recipe)) plannedCoreCounts.set(c, (plannedCoreCounts.get(c) || 0) + 1);
  }

  // Expiring food that no upcoming meal uses yet is what the finder should
  // push; once everything expiring is in a meal, fall back to all of it.
  const unusedExpiring = expiring.filter((item) => !planned.some((e) => recipeUsesItem(e.recipe, item.name)));
  const expiringFocus = new Set(unusedExpiring.length > 0 ? unusedExpiring : expiring);

  const ranked = recipes
    .filter((r) => !r.isPlaceholder)
    .map((recipe) => {
      const cores = [...recipeCores(recipe)];
      const stats = recipeHave(recipe, kitchen);
      const usedExpiring = expiring.filter((item) => recipeUsesItem(recipe, item.name));
      const expUsed = usedExpiring.filter((item) => expiringFocus.has(item));
      const sharedCount = cores.filter((c) => plannedCoreCounts.has(c)).length;
      const score =
        expUsed.length * 2 +
        (stats.missingCount > 0 ? -stats.missingCount * 0.5 : 2) +
        sharedCount * 0.5 -
        (plannedIds.has(recipe.id) ? 1.5 : 0);
      return { recipe, cores, stats, expUsed, usesExpiring: usedExpiring.length > 0, sharedCount, score };
    })
    .sort((a, b) => b.score - a.score || a.recipe.title.localeCompare(b.recipe.title));

  const nameOf = namesAsWritten(recipes);
  for (const x of ranked) x.nameOf = nameOf;
  return { ranked, unusedExpiring, nameOf };
}

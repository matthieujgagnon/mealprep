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

export function formatTrayTime(minutes) {
  if (!minutes) return null;
  return minutes >= 60 ? `${Math.floor(minutes / 60)} H` : `${minutes} MIN`;
}

function joinNames(cores) {
  return cores.join(", ");
}

// Ranks every recipe for the tray. `upcomingEntries` are this week's
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

  // Expiring food that no upcoming meal uses yet is what the tray should
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

  return { ranked, expiringCores, unusedExpiringCores: unusedExpiring };
}

function tile(info, reason) {
  return { ...info, reason };
}

// Suggested tab: three groups, each recipe appearing in at most one.
export function suggestedGroups(ranked) {
  const taken = new Set();
  const pick = (list, n) => {
    const out = list.filter((x) => !taken.has(x.recipe.id)).slice(0, n);
    out.forEach((x) => taken.add(x.recipe.id));
    return out;
  };

  const expiring = pick(
    ranked.filter((x) => x.expUsed.length > 0).sort((a, b) => b.expUsed.length - a.expUsed.length || b.score - a.score),
    3
  );
  const nothing = pick(ranked.filter((x) => x.stats.totalCount > 0 && x.stats.missingCount === 0), 2);

  const groups = [
    { id: "expiring", title: "USES WHAT'S EXPIRING", tone: "pink", tiles: expiring.map((x) => tile(x, `Uses ${joinNames(x.expUsed)}`)) },
    { id: "nothing", title: "NOTHING TO BUY", tone: "yellow", tiles: nothing.map((x) => tile(x, "Everything is in your kitchen")) },
  ].filter((g) => g.tiles.length > 0);

  // No inventory yet: still offer something rather than an empty tray.
  if (groups.length === 0) {
    const top = pick(ranked, 5);
    if (top.length > 0) {
      groups.push({
        id: "top",
        title: "GOOD THIS WEEK",
        tone: "paper",
        tiles: top.map((x) => tile(x, x.cores.slice(0, 3).map(capitalize).join(", "))),
      });
    }
  }
  return groups;
}

// Plan around tab: recipes that use the most picked ingredients.
export function planAroundMatches(ranked, pickedCores, limit = 6) {
  if (pickedCores.size === 0) return [];
  return ranked
    .map((x) => ({ x, matched: x.cores.filter((c) => pickedCores.has(c)) }))
    .filter(({ matched }) => matched.length > 0)
    .sort((a, b) => b.matched.length - a.matched.length || b.x.score - a.x.score)
    .slice(0, limit)
    .map(({ x, matched }) => tile(x, `Uses ${joinNames(matched)}`));
}

export function searchRecipes(ranked, query) {
  const q = query.trim().toLowerCase();
  return [...ranked]
    .sort((a, b) => a.recipe.title.localeCompare(b.recipe.title))
    .filter(
      (x) =>
        !q ||
        x.recipe.title.toLowerCase().includes(q) ||
        x.recipe.ingredients?.some((i) => i.name?.toLowerCase().includes(q))
    )
    .map((x) => tile(x, x.cores.slice(0, 3).map(capitalize).join(", ")));
}

import { recipeHaveStats } from "./onHand.js";
import { PROTEINS, recipeUsesProtein } from "./proteins.js";
import { recipeTotalMinutes } from "./mealSlots.js";

// Pure logic behind the Recipes page, shared by the phone and desktop layouts.

export function isUrlLike(text) {
  const q = text.trim();
  return /^https?:\/\//i.test(q) || /\.\w{2,}\//.test(q);
}

// The Time dropdown. A recipe with no time set only matches "any".
export const TIME_FILTERS = ["any", "u20", "u45", "u60", "o60"];

export function matchesTime(recipe, timeId) {
  if (timeId === "any") return true;
  const minutes = recipeTotalMinutes(recipe);
  if (minutes <= 0) return false;
  switch (timeId) {
    case "u20":
      return minutes <= 20;
    case "u45":
      return minutes <= 45;
    case "u60":
      return minutes < 60;
    case "o60":
      return minutes >= 60;
    default:
      return true;
  }
}

// The Sort dropdown: 0 recently added, 1 fewest missing, 2 quickest.
export function sortRecipes(recipes, sortIndex, haveCores) {
  if (sortIndex === 1) {
    // Fewest to buy first; recipes without any ingredient list can't be
    // judged, so they go last. Ties: more of it on hand, then by name.
    const stats = new Map(recipes.map((r) => [r.id, recipeHaveStats(r, haveCores)]));
    return [...recipes].sort((a, b) => {
      const sa = stats.get(a.id);
      const sb = stats.get(b.id);
      if ((sa.totalCount === 0) !== (sb.totalCount === 0)) return sa.totalCount === 0 ? 1 : -1;
      if (sa.missingCount !== sb.missingCount) return sa.missingCount - sb.missingCount;
      const fa = sa.totalCount ? sa.matchedCount / sa.totalCount : 0;
      const fb = sb.totalCount ? sb.matchedCount / sb.totalCount : 0;
      if (fa !== fb) return fb - fa;
      return a.title.localeCompare(b.title);
    });
  }
  if (sortIndex === 2) {
    // Quickest first; recipes with no time set can't be ranked, so they go last.
    const minutes = (r) => recipeTotalMinutes(r) || Infinity;
    return [...recipes].sort((a, b) => minutes(a) - minutes(b) || a.title.localeCompare(b.title));
  }
  return [...recipes].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// The first of the app's proteins a recipe uses (the card's "SUPPER · CHICKEN"),
// or null.
export function proteinOfRecipe(recipe) {
  return PROTEINS.find((p) => recipeUsesProtein(recipe, p)) || null;
}

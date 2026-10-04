// How Makeable orders the recipes inside each group (Ready now, One or two
// short, Needs a shop). The order is whatever the Sort control says, and
// nothing else: no recipe is pinned, and a tie is settled by title, never by
// the order the server happened to return the recipes in.
//
// Each item is what findRecipesByIngredients returns, plus `atRiskUsed`
// (the ingredients it would finish that expire within 3 days).
import { recipeTotalMinutes } from "./mealSlots.js";

export const MAKEABLE_SORTS = ["useItUp", "fewest", "quickest", "az"];

const byTitle = (a, b) => (a.recipe.title || "").localeCompare(b.recipe.title || "") || String(a.recipe.id).localeCompare(String(b.recipe.id));

// Fewest to buy, then the most already on hand.
const byFewestMissing = (a, b) =>
  a.missingIngredients.length - b.missingIngredients.length || b.matchedCount - a.matchedCount;

const COMPARATORS = {
  // Recipes that finish food about to expire first, then the fewest to buy.
  useItUp: (a, b) => (b.atRiskUsed.length > 0) - (a.atRiskUsed.length > 0) || b.atRiskUsed.length - a.atRiskUsed.length || byFewestMissing(a, b),
  fewest: byFewestMissing,
  // No time set can't be ranked, so those go last.
  quickest: (a, b) => (recipeTotalMinutes(a.recipe) || Infinity) - (recipeTotalMinutes(b.recipe) || Infinity),
  az: () => 0,
};

export function sortMakeable(items, sort) {
  const compare = COMPARATORS[sort] || COMPARATORS.useItUp;
  return [...items].sort((a, b) => compare(a, b) || byTitle(a, b));
}

import { daysUntil } from "./pantryInventory.js";
import { core, recipeCores } from "./similarRecipes.js";

// Everything that counts as "have" without being typed in: non-expired
// inventory, plus custom pantry staples not already covered by an inventory
// item of the same name.
export function buildCombinedHave(pantryInventory, customStaples) {
  const inStock = pantryInventory
    .filter((item) => !item.expiresAt || daysUntil(item.expiresAt) >= 0)
    .map((item) => item.name);
  const haveLower = new Set(inStock.map((n) => n.toLowerCase()));
  const stapleExtra = (customStaples || []).filter((s) => !haveLower.has(s.toLowerCase()));
  return [...inStock, ...stapleExtra];
}

export function haveCoresFor(pantryInventory, customStaples) {
  return new Set(buildCombinedHave(pantryInventory, customStaples).map((n) => core(n)).filter(Boolean));
}

// A recipe's ingredient cores (staples excluded) against what's on hand.
export function recipeHaveStats(recipe, haveCores) {
  const cores = [...recipeCores(recipe)];
  const missing = cores.filter((c) => !haveCores.has(c));
  return {
    totalCount: cores.length,
    matchedCount: cores.length - missing.length,
    missingCount: missing.length,
    missing,
  };
}

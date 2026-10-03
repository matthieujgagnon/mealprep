import { buildGroceryList, canonicalize } from "./groceryList.js";

// The same ingredient key the Grocery List groups rows by, so "2 limes" and
// "lime" count as one thing already on the list.
export function groceryCore(name) {
  const { core } = canonicalize(name);
  return core || name.trim().toLowerCase();
}

// Every ingredient already on the list - from a planned recipe (any meal
// from today on) or added by hand. Adding something in this set again would
// only create a duplicate row (hand-added items are never merged into each
// other). Removed rows (see GroceryItemOverride) don't count.
export function coresOnGroceryList(plannerEntries, extraItems, overrides = []) {
  return new Set(
    buildGroceryList(plannerEntries, [], {}, [], extraItems, overrides)
      .filter((item) => !item.removed)
      .map((item) => item.core)
  );
}

// Recipe rows that were removed, by core -> row key, so adding the same
// ingredient again can bring the row back instead of adding a duplicate.
export function removedRecipeRows(plannerEntries, overrides = []) {
  return new Map(
    buildGroceryList(plannerEntries, [], {}, [], [], overrides)
      .filter((item) => item.removed)
      .map((item) => [item.core, item.key])
  );
}

// Override rows whose meals have all left the plan: a recipe row's removal
// (and own amount) only lasts while a planned meal still needs the item, so
// once none does, the saved row is stale and is cleared. Hand-added rows
// (keys "extra-...") live until you delete them. `plannerEntries` must be
// the whole upcoming plan - passing a partial one would clear live rows.
export function staleOverrideKeys(plannerEntries, overrides = []) {
  const planned = new Set(buildGroceryList(plannerEntries, [], {}, [], [], []).map((item) => item.key));
  return overrides.filter((o) => !o.key.startsWith("extra-") && !planned.has(o.key)).map((o) => o.key);
}

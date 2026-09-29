import { buildGroceryList, canonicalize } from "./groceryList.js";

// The same ingredient key the Grocery List groups rows by, so "2 limes" and
// "lime" count as one thing already on the list.
export function groceryCore(name) {
  const { core } = canonicalize(name);
  return core || name.trim().toLowerCase();
}

// Every ingredient already on this week's list - from a planned recipe or
// added by hand. Adding something in this set again would only create a
// duplicate row (hand-added items are never merged into each other).
// Rows removed for this week (see GroceryItemOverride) don't count.
export function coresOnGroceryList(plannerEntries, extraItems, overrides = []) {
  return new Set(
    buildGroceryList(plannerEntries, [], {}, [], extraItems, overrides)
      .filter((item) => !item.removed)
      .map((item) => item.core)
  );
}

// Recipe rows removed for this week, by core -> row key, so adding the same
// ingredient again can bring the row back instead of adding a duplicate.
export function removedRecipeRows(plannerEntries, overrides = []) {
  return new Map(
    buildGroceryList(plannerEntries, [], {}, [], [], overrides)
      .filter((item) => item.removed)
      .map((item) => [item.core, item.key])
  );
}

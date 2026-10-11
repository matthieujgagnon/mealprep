// Leftovers are one thing everywhere: a LEFTOVER item in Inventory (portions of
// a cooked meal, on the Leftovers shelf, in the fridge or the freezer) that the
// Planner can place. These are the keep times the finished view, the Planner's
// "past fridge life" warning, "Move to fridge to thaw" and Inventory's own form
// all use, so they always agree.

// USDA FoodKeeper guidance for cooked leftovers: 3 to 4 days in the fridge (a
// recipe can say its own, `fridgeLifeDays`), 2 to 3 months in the freezer.
export const FRIDGE_DAYS = 4;
export const FREEZER_DAYS = 75;

export function leftoverKeepDays(recipe, place) {
  if (place === "freezer") return FREEZER_DAYS;
  return recipe?.fridgeLifeDays || FRIDGE_DAYS;
}

// The use-by date of leftovers put in `place` at `from`.
export function leftoverExpiry(recipe, place, from = new Date()) {
  return new Date(from.getTime() + leftoverKeepDays(recipe, place) * 86400000).toISOString();
}

// The Inventory item the Leftovers card adds: what its preview shows is what is
// saved. `name` is the recipe's title (the LEFTOVER tag says what it is).
export function leftoverItem(recipe, portions, place, now = new Date()) {
  return {
    name: recipe.title,
    quantity: portions,
    unit: "portion",
    location: place,
    category: "Deli & Prepared Foods",
    isLeftover: true,
    recipeId: recipe.id || null,
    purchasedAt: now.toISOString(),
    expiresAt: leftoverExpiry(recipe, place, now),
  };
}

// "Move to fridge to thaw": the freezer leftovers go to the fridge, and their
// days left start over with the fridge keep time.
export function thawPatch(recipe, now = new Date()) {
  return { location: "fridge", purchasedAt: now.toISOString(), expiresAt: leftoverExpiry(recipe, "fridge", now) };
}

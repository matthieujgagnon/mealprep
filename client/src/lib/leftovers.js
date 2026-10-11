import { t } from "../i18n/index.js";

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

// "2026-10-07" for a planned meal (its week's Monday plus its day).
export function entryDate(entry) {
  const [y, m, d] = entry.weekStart.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + entry.dayOfWeek)).toISOString().slice(0, 10);
}

// The leftover meals already planned for a recipe from today on that no Inventory
// leftovers feed yet ("Place leftovers", Option-drag, the round button): once the
// recipe is cooked and its leftovers added, they eat from those leftovers.
export function linkableCopies(recipeId, entries, todayKey) {
  const seen = new Set();
  return entries.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return e.isLeftover && !e.leftoverItemId && !e.cookedAt && (e.recipe?.id || e.recipeId) === recipeId && entryDate(e) >= todayKey;
  });
}

// Whether a planned leftover is past its keep time: one that eats from Inventory
// leftovers is late when its day comes after their use-by date; one that doesn't
// yet, when it is more days after the meal it is from than the recipe keeps in
// the fridge (`cookedDay`, that meal's day in the same week).
export function leftoverIsStale(entry, { item, cookedDay } = {}) {
  if (!entry.isLeftover) return false;
  if (item?.expiresAt) return entryDate(entry) > String(item.expiresAt).slice(0, 10);
  if (cookedDay == null) return false;
  return entry.dayOfWeek - cookedDay > leftoverKeepDays(entry.recipe, "fridge");
}

// « Restes · Chili · 2 portions »: how leftovers are named on the Planner (their
// name is the recipe's title unless it was changed).
export function leftoverTitle(item) {
  return t("finder.leftoverTitle", { title: item.name, count: item.quantity ?? 1 });
}

// The leftovers the Planner search offers, soonest use-by first: each Inventory
// leftover with portions left, whose name (or recipe's name) has the words typed.
export function plannableLeftovers(items, recipes, query = "") {
  const words = String(query).trim().toLowerCase().split(/\s+/).filter(Boolean);
  return items
    .filter((i) => i.isLeftover && (i.quantity == null || i.quantity > 0))
    .map((item) => ({ item, recipe: recipes.find((r) => r.id === item.recipeId) || null }))
    .filter(({ item, recipe }) => {
      const text = `${item.name} ${recipe?.title || ""}`.toLowerCase();
      return words.every((w) => text.includes(w));
    })
    .sort((a, b) => String(a.item.expiresAt || "9").localeCompare(String(b.item.expiresAt || "9")));
}

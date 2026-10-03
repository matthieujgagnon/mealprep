// Where a recipe sits on the Planner (Recipe.mealSlot on the server). One
// per recipe. "Side" (garlic asparagus, rice) and "Snack" fit any
// meal; "Pantry / Prep" (pickles, roasted veg, sauces) never takes a meal
// on the calendar.
import { t } from "../i18n/index.js";

const SLOT_IDS = ["breakfast", "lunch", "dinner", "side", "snack", "prep"];

// Labels are read when used, so they're always in the current language.
export const RECIPE_SLOTS = SLOT_IDS.map((id) => ({
  id,
  get label() {
    return t(`recipeSlots.${id}`);
  },
}));

export const RECIPE_SLOT_LABEL = Object.defineProperties(
  {},
  Object.fromEntries(SLOT_IDS.map((id) => [id, { enumerable: true, get: () => t(`recipeSlots.${id}`) }]))
);

// Recipes saved before the slot existed may still carry the meal as a tag.
const TAG_SLOTS = [
  ["dinner", "dinner"],
  ["supper", "dinner"],
  ["lunch", "lunch"],
  ["breakfast", "breakfast"],
  ["snack", "snack"],
  ["side", "side"],
  ["sides", "side"],
  ["side dish", "side"],
];

export function recipeSlot(recipe) {
  if (recipe?.mealSlot) return recipe.mealSlot;
  const tags = (recipe?.tags || []).map((t) => t.toLowerCase());
  return TAG_SLOTS.find(([tag]) => tags.includes(tag))?.[1] || null;
}

export function slotHint(slotId) {
  if (slotId === "prep") return t("recipeSlots.hintPrep");
  if (slotId === "snack") return t("recipeSlots.hintSnack");
  if (slotId === "side") return t("recipeSlots.hintSide");
  if (slotId) return t("recipeSlots.hintMeal", { meal: RECIPE_SLOT_LABEL[slotId].toLowerCase() });
  return t("recipeSlots.hintNone");
}

// "35 min", "1 h 15 min", "4 h" - the time chip on recipe cards and the editor.
export function formatRecipeTime(minutes) {
  if (!minutes) return null;
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? t("time.hoursMinutes", { h, m }) : t("time.hours", { h });
  }
  return t("time.minutes", { m: minutes });
}

export function recipeTotalMinutes(recipe) {
  return (Number(recipe?.prepTimeMinutes) || 0) + (Number(recipe?.cookTimeMinutes) || 0);
}

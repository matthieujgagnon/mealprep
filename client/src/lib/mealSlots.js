// What a recipe is: any number of meal types at once (Recipe.mealSlots on the server: Chow
// Mein is a supper and a lunch), and « Plat préparé » or not (Recipe.isPrepared: croissants
// are a breakfast AND nothing to cook). "Side" (garlic asparagus, rice), "Snack" and "Dessert"
// fit any meal; "Pantry / Prep" (pickles, roasted veg, sauces) never takes a meal on the
// calendar. server/src/lib/mealTypes.js has the same ids.
import { t } from "../i18n/index.js";

const SLOT_IDS = ["breakfast", "lunch", "dinner", "side", "snack", "dessert", "prep"];

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
  ["dessert", "dessert"],
  ["desserts", "dessert"],
  ["side", "side"],
  ["sides", "side"],
  ["side dish", "side"],
];

// The ONE place that says what meal types a recipe has, in the usual order. The list first
// (`mealSlots`); a recipe read from before the list existed has the one old `mealSlot`; and a
// recipe that only carries the meal as an old tag is read that way. [] = not sorted yet.
export function recipeSlots(recipe) {
  const listed = Array.isArray(recipe?.mealSlots) ? recipe.mealSlots.filter((id) => SLOT_IDS.includes(id)) : [];
  if (listed.length > 0) return SLOT_IDS.filter((id) => listed.includes(id));
  if (recipe?.mealSlot && SLOT_IDS.includes(recipe.mealSlot)) return [recipe.mealSlot];
  const tags = (recipe?.tags || []).map((tag) => tag.toLowerCase());
  const fromTag = TAG_SLOTS.find(([tag]) => tags.includes(tag))?.[1];
  return fromTag ? [fromTag] : [];
}

// The first meal type: where a card needs just one (its line colour, the caption's lead).
export function recipeSlot(recipe) {
  return recipeSlots(recipe)[0] || null;
}

export const hasSlot = (recipe, slotId) => recipeSlots(recipe).includes(slotId);

// « Plat préparé »: nothing to cook.
export const isPreparedRecipe = (recipe) => recipe?.isPrepared === true;

// A card has room for one meal type: the first, then "+1" for each other ("Lunch +1").
// "" when the recipe has none yet.
export function recipeSlotCaption(recipe) {
  const slots = recipeSlots(recipe);
  if (slots.length === 0) return "";
  const first = t(`recipes.mealTypes.${slots[0]}`);
  return slots.length > 1 ? `${first} +${slots.length - 1}` : first;
}

// What "Meals" means everywhere (Recipes' Meals chip, Makeable's "Meals only", Home, the
// Planner's Makeable now): a recipe with breakfast, lunch or supper among its types that is
// not « plat préparé ». A side that is also a supper is a meal; a recipe that is a dessert, a
// side, a snack or a pantry prep and nothing else is not.
export const MEAL_SLOT_IDS = ["breakfast", "lunch", "dinner"];

export function isMealRecipe(recipe) {
  return !isPreparedRecipe(recipe) && recipeSlots(recipe).some((id) => MEAL_SLOT_IDS.includes(id));
}

// The groups the Recipes "Meals" chip and Makeable's meal-type chips filter by. A recipe with
// no type yet is in none of them.
export const MEAL_GROUPS = {
  meals: MEAL_SLOT_IDS,
  breakfast: ["breakfast"],
  desserts: ["dessert"],
  snacks: ["snack"],
  sides: ["side"],
};

export function inMealGroup(recipe, groupId) {
  if (groupId === "meals") return isMealRecipe(recipe);
  return recipeSlots(recipe).some((id) => MEAL_GROUPS[groupId]?.includes(id));
}

// "Makeable now" counts meals only (isMealRecipe). A recipe that is only a side, snack, dessert or
// pantry / prep (sauces live there), or « plat préparé » (nothing to cook), is left out, unless
// "Include sides, desserts and prepared" is on. A recipe with no type yet counts like a meal, so
// nothing disappears before it is sorted. This is the one rule every count and filter uses
// (Recipes, Home, Makeable, the finder).
export const NON_MEAL_SLOTS = ["side", "snack", "dessert", "prep"];

export function isMakeableMeal(recipe, includeSides = false) {
  if (includeSides) return true;
  if (isPreparedRecipe(recipe)) return false;
  const slots = recipeSlots(recipe);
  return slots.length === 0 || slots.some((id) => MEAL_SLOT_IDS.includes(id));
}

// Whether the rule applies at all: not when "Include sides, desserts and prepared" is on, and
// not when the person has narrowed to one of the left-out kinds themselves (the Sides chip, the
// Meal menu on Dessert or Prepared): that choice is explicit.
export function makeableRuleOn(includeSides, narrowedTo = null) {
  return !includeSides && !NON_MEAL_SLOTS.includes(narrowedTo) && narrowedTo !== "prepared";
}

export function slotHint(slotId) {
  if (slotId === "prep") return t("recipeSlots.hintPrep");
  if (slotId === "snack") return t("recipeSlots.hintSnack");
  if (slotId === "dessert") return t("recipeSlots.hintDessert");
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

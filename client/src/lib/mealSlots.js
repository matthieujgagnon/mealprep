// Where a recipe sits on the Planner (Recipe.mealSlot on the server). One
// per recipe. "Side" (garlic asparagus, rice) and "Snack" fit any
// meal; "Pantry / Prep" (pickles, roasted veg, sauces) never takes a meal
// on the calendar.
export const RECIPE_SLOTS = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
  { id: "side", label: "Side" },
  { id: "snack", label: "Snack" },
  { id: "prep", label: "Pantry / Prep" },
];

export const RECIPE_SLOT_LABEL = Object.fromEntries(RECIPE_SLOTS.map((s) => [s.id, s.label]));

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
  if (slotId === "prep") return "Doesn't take a meal slot on the calendar. It shows up on your prep and grocery lists.";
  if (slotId === "snack") return "Can go in any slot on the calendar.";
  if (slotId === "side") return "A side dish: goes with a meal in any slot, and Fill empty slots leaves it out.";
  if (slotId) return `Goes in the ${RECIPE_SLOT_LABEL[slotId].toLowerCase()} row of the Planner.`;
  return "Pick where this belongs in the Planner.";
}

// "35 min", "1 h 15 min", "4 h" - the time chip on recipe cards and the editor.
export function formatRecipeTime(minutes) {
  if (!minutes) return null;
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h} h${m ? ` ${m} min` : ""}`;
  }
  return `${minutes} min`;
}

export function recipeTotalMinutes(recipe) {
  return (Number(recipe?.prepTimeMinutes) || 0) + (Number(recipe?.cookTimeMinutes) || 0);
}

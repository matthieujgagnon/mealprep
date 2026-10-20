// Which calendar days have a planned meal, for the Planner's month calendar
// (three dashes under each day, one per meal, and the day's preview card). An entry is a week (its Monday,
// "YYYY-MM-DD") and a day in it (0 = Monday). Pure calendar-date math on the
// dates the browser sent, like upcomingMeals.js.

import { isPreparedMeal, isPreparedNoteTitle } from "./mealItem.js";
import { realPhoto } from "./itemPhoto.js";

const KEY = /^\d{4}-\d{2}-\d{2}$/;

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

// A real "YYYY-MM-DD" date, or null (2026-02-31 is not one).
export function validKey(key) {
  if (typeof key !== "string" || !KEY.test(key)) return null;
  const [y, m, d] = key.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  return dateKey(day) === key ? day : null;
}

// The Monday on or before a "YYYY-MM-DD" date.
export function mondayKey(key) {
  const day = validKey(key);
  if (!day) return null;
  const back = (day.getUTCDay() + 6) % 7;
  return dateKey(new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() - back)));
}

const MEAL_ORDER = { breakfast: 0, lunch: 1, dinner: 2 };

// The same days, with what is planned on each: { date, meals: [{ mealType,
// title, placeholder, photoUrl, isLeftover, prepared }] }, days sorted, meals in the
// day's order (breakfast, lunch, supper). A slot holds one thing, so a second
// entry in the same slot is left out.
// `linked`: the user's Inventory meals the planned ones may eat, by id
// ({ isPreparedMeal, imageUrl }). A planned meal that eats a prepared meal says
// "prepared meal", not "leftovers". A note linked to an Inventory meal (a prepared
// meal, or leftovers typed by hand) has no recipe photo: it shows the item's photo,
// read live, and only once the item has left Inventory the copy the entry kept
// (`photoUrl`).
export function plannedDays(entries, from, to, linked = new Map()) {
  const byDay = new Map();
  for (const { weekStart, dayOfWeek, mealType, isLeftover, leftoverItemId, photoUrl, recipe } of entries) {
    const monday = validKey(weekStart);
    if (!monday) continue;
    const key = dateKey(new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + dayOfWeek)));
    if (key < from || key > to) continue;
    const meals = byDay.get(key) || [];
    if (!meals.some((m) => m.mealType === mealType)) {
      const item = leftoverItemId ? linked.get(leftoverItemId) : null;
      const note = !!isLeftover && !!recipe?.isPlaceholder;
      meals.push({
        mealType,
        title: recipe?.title || "",
        placeholder: !!recipe?.isPlaceholder,
        photoUrl: (note ? (item ? realPhoto(item.imageUrl) : realPhoto(photoUrl)) : null) || recipe?.photoUrl || null,
        isLeftover: !!isLeftover,
        prepared: !!isLeftover && (item ? isPreparedMeal(item) : !!recipe?.isPlaceholder && isPreparedNoteTitle(recipe.title)),
      });
    }
    byDay.set(key, meals);
  }
  return [...byDay.keys()]
    .sort()
    .map((date) => ({ date, meals: byDay.get(date).sort((a, b) => (MEAL_ORDER[a.mealType] ?? 9) - (MEAL_ORDER[b.mealType] ?? 9)) }));
}

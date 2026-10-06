// Which calendar days have a planned meal, for the Planner's month calendar
// (three dashes under each day, one per meal, and the day's preview card). An entry is a week (its Monday,
// "YYYY-MM-DD") and a day in it (0 = Monday). Pure calendar-date math on the
// dates the browser sent, like upcomingMeals.js.

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
// title, placeholder, photoUrl, isLeftover }] }, days sorted, meals in the
// day's order (breakfast, lunch, supper). A slot holds one thing, so a second
// entry in the same slot is left out.
export function plannedDays(entries, from, to) {
  const byDay = new Map();
  for (const { weekStart, dayOfWeek, mealType, isLeftover, recipe } of entries) {
    const monday = validKey(weekStart);
    if (!monday) continue;
    const key = dateKey(new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + dayOfWeek)));
    if (key < from || key > to) continue;
    const meals = byDay.get(key) || [];
    if (!meals.some((m) => m.mealType === mealType)) {
      meals.push({
        mealType,
        title: recipe?.title || "",
        placeholder: !!recipe?.isPlaceholder,
        photoUrl: recipe?.photoUrl || null,
        isLeftover: !!isLeftover,
      });
    }
    byDay.set(key, meals);
  }
  return [...byDay.keys()]
    .sort()
    .map((date) => ({ date, meals: byDay.get(date).sort((a, b) => (MEAL_ORDER[a.mealType] ?? 9) - (MEAL_ORDER[b.mealType] ?? 9)) }));
}

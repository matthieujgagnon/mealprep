// Which calendar days have a planned meal, for the phone Planner's month
// calendar (a dot under each such day). An entry is a week (its Monday,
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

// The days between `from` and `to` (both included) that have at least one
// entry, sorted, each once.
export function plannedDates(entries, from, to) {
  const found = new Set();
  for (const { weekStart, dayOfWeek } of entries) {
    const monday = validKey(weekStart);
    if (!monday) continue;
    const key = dateKey(new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + dayOfWeek)));
    if (key >= from && key <= to) found.add(key);
  }
  return [...found].sort();
}

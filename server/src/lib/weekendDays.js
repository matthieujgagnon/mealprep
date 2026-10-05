// The days the Planner groups as the weekend, saved per account. Days are
// numbered like the Planner's: 0 = Monday ... 6 = Sunday.

export const DEFAULT_WEEKEND_DAYS = [5, 6];

// A clean, sorted list of days from whatever the browser sent, or null when
// it isn't a list of whole days 0 to 6. Repeats are dropped; an empty list
// is fine (no weekend block).
export function cleanWeekendDays(value) {
  if (!Array.isArray(value) || value.length > 7) return null;
  if (!value.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return null;
  return [...new Set(value)].sort((a, b) => a - b);
}

// A true or false from whatever the browser sent, or null when it is neither
// (for the weekend's on/off and "include the evening before" switches).
export function cleanWeekendFlag(value) {
  return typeof value === "boolean" ? value : null;
}

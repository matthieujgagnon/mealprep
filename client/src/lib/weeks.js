// Small date helpers for the multi-week planner. Weeks are always keyed by
// their Monday, stored/passed around as a plain "YYYY-MM-DD" string so it's
// unambiguous across timezones and easy to compare/sort as text.

function toDateStr(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Monday of the week containing `date` (defaults to today), as "YYYY-MM-DD".
export function getMondayOf(date = new Date()) {
  const d = new Date(date);
  const dow = d.getDay(); // 0 = Sunday ... 6 = Saturday
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diffToMonday);
  return toDateStr(d);
}

// Shift a "YYYY-MM-DD" week-start string by N weeks (positive or negative).
export function shiftWeek(weekStart, weeks) {
  const d = new Date(`${weekStart}T00:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return toDateStr(d);
}

// "Sep 1 – Sep 7, 2026" style label for the week toolbar.
export function formatWeekLabel(weekStart) {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(`${weekStart}T00:00:00`);
  end.setDate(end.getDate() + 6);
  const startStr = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const endStr = end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${startStr} – ${endStr}`;
}

export function isCurrentWeek(weekStart) {
  return weekStart === getMondayOf();
}

const DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// The actual calendar date for a planner column, as "YYYY-MM-DD" —
// dayIndex is 0 (Monday) through 6 (Sunday), matching PlannerEntry.dayOfWeek.
export function dateForDayOfWeek(weekStart, dayIndex) {
  const d = new Date(`${weekStart}T00:00:00`);
  d.setDate(d.getDate() + dayIndex);
  return toDateStr(d);
}

// "Mon 9/1" style label for a planner day-column header — this is what
// turns the board from generic Mon–Sun slots into a real dated week.
export function formatDayHeader(weekStart, dayIndex) {
  const d = new Date(`${dateForDayOfWeek(weekStart, dayIndex)}T00:00:00`);
  return `${DAY_ABBR[dayIndex]} ${d.getMonth() + 1}/${d.getDate()}`;
}

// True if this planner column's actual calendar date is today — used to
// highlight the current day when viewing the current week.
export function isToday(weekStart, dayIndex) {
  return dateForDayOfWeek(weekStart, dayIndex) === toDateStr(new Date());
}

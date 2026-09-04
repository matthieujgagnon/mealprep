// Every date the planner deals with is a plain "YYYY-MM-DD" calendar-date
// string — never a Date parsed from one. `new Date("2026-08-31")` parses as
// UTC midnight, which prints as Aug 30th in any timezone west of UTC — a
// classic off-by-one that would misfile a whole day's meals under the wrong
// date for anyone not on UTC. All arithmetic below builds Dates from
// year/month/day components instead, so it stays in local time throughout.

const DAY_MS = 24 * 60 * 60 * 1000;

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Local Date -> "YYYY-MM-DD"
export function toDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// "YYYY-MM-DD" -> local Date at midnight
export function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Monday of the week containing this date, as a local Date. getDay() is
// 0=Sunday..6=Saturday; converts to a Monday-start offset.
export function mondayOf(date) {
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  const result = new Date(date);
  result.setDate(result.getDate() + offset);
  return result;
}

export function addDays(key, n) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return toDateKey(d);
}

export function shiftWeek(key, deltaWeeks) {
  return addDays(key, deltaWeeks * 7);
}

export function currentWeekStart() {
  return toDateKey(mondayOf(new Date()));
}

export function isCurrentWeek(weekStart) {
  return weekStart === currentWeekStart();
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// "Aug 31 – Sep 6, 2026"
export function formatWeekRangeLabel(weekStart) {
  const start = parseDateKey(weekStart);
  const end = parseDateKey(addDays(weekStart, 6));
  const startLabel = `${MONTH_NAMES[start.getMonth()]} ${start.getDate()}`;
  const endLabel =
    start.getMonth() === end.getMonth()
      ? `${end.getDate()}`
      : `${MONTH_NAMES[end.getMonth()]} ${end.getDate()}`;
  return `${startLabel} – ${endLabel}, ${end.getFullYear()}`;
}

// { weekday: "Mon", dayNum: 31, monthShort: "Aug" } for the given offset (0-6)
// within a week starting at weekStart.
const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function formatDayLabel(weekStart, dayOfWeek) {
  const date = parseDateKey(addDays(weekStart, dayOfWeek));
  return {
    weekday: WEEKDAY_NAMES[dayOfWeek],
    dayNum: date.getDate(),
    monthShort: MONTH_NAMES[date.getMonth()],
    isToday: toDateKey(date) === toDateKey(new Date()),
  };
}

export function weeksBetween(fromKey, toKey) {
  return Math.round((parseDateKey(toKey) - parseDateKey(fromKey)) / (7 * DAY_MS));
}

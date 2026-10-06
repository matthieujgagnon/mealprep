// Every date the planner deals with is a plain "YYYY-MM-DD" calendar-date
// string — never a Date parsed from one. `new Date("2026-08-31")` parses as
// UTC midnight, which prints as Aug 30th in any timezone west of UTC — a
// classic off-by-one that would misfile a whole day's meals under the wrong
// date for anyone not on UTC. All arithmetic below builds Dates from
// year/month/day components instead, so it stays in local time throughout.

import { dict, t } from "../i18n/index.js";

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

// "Aug 31 – Sep 6, 2026" / "31 août – 6 sept. 2026"
// "Aug 31 – Sep 6, 2026" / "31 août – 6 sept. 2026"; without the year
// when { year: false }.
export function formatWeekRangeLabel(weekStart, { year = true } = {}) {
  const start = parseDateKey(weekStart);
  const end = parseDateKey(addDays(weekStart, 6));
  const months = dict().months.short;
  const vars = {
    month: months[start.getMonth()],
    startDay: start.getDate(),
    endMonth: months[end.getMonth()],
    endDay: end.getDate(),
    year: end.getFullYear(),
  };
  const sameMonth = start.getMonth() === end.getMonth();
  if (!year) return t(sameMonth ? "dates.weekSameMonth" : "dates.weekTwoMonths", vars);
  return t(sameMonth ? "dates.rangeSameMonth" : "dates.rangeTwoMonths", vars);
}

// The week the way the Planner says it everywhere (the week pill, the week
// calendar, the slot picker): "Oct 5 – 11", "Sep 28 – Oct 4" / "5 – 11 oct.",
// "28 sept. – 4 oct.". Always this one helper, so the dates read the same.
export function formatWeekLabel(weekStart) {
  return formatWeekRangeLabel(weekStart, { year: false });
}

// "Monday, Sep 28" / "Lundi 28 sept."
export function formatWeekdayMonthDay(date) {
  const d = dict();
  const weekday = d.days.long[(date.getDay() + 6) % 7];
  return t("dates.weekdayMonthDay", {
    weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1),
    month: d.months.short[date.getMonth()],
    day: date.getDate(),
  });
}

// "Tue, Oct 6" / "mar. 6 oct."
export function formatShortWeekdayMonthDay(date) {
  const d = dict();
  return t("dates.weekdayMonthDay", {
    weekday: d.days.short[(date.getDay() + 6) % 7],
    month: d.months.short[date.getMonth()],
    day: date.getDate(),
  });
}

// "Aug 31" / "31 août"
export function formatMonthDayKey(key) {
  const date = parseDateKey(key);
  return t("dates.monthDay", { month: dict().months.short[date.getMonth()], day: date.getDate() });
}

// { weekday: "Mon", dayNum: 31, monthShort: "Aug" } for the given offset (0-6)
// within a week starting at weekStart (in French: "lun.", 31, "août").
export function formatDayLabel(weekStart, dayOfWeek) {
  const date = parseDateKey(addDays(weekStart, dayOfWeek));
  return {
    weekday: dict().days.short[dayOfWeek],
    dayNum: date.getDate(),
    monthShort: dict().months.short[date.getMonth()],
    isToday: toDateKey(date) === toDateKey(new Date()),
  };
}

// True when that day of the week is before today (whole earlier weeks too).
export function isPastDay(weekStart, dayOfWeek) {
  return addDays(weekStart, dayOfWeek) < toDateKey(new Date());
}

export function weeksBetween(fromKey, toKey) {
  return Math.round((parseDateKey(toKey) - parseDateKey(fromKey)) / (7 * DAY_MS));
}

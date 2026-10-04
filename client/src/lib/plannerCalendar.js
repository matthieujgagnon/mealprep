import { addDays, mondayOf, parseDateKey, toDateKey } from "./dates.js";

// The month calendar on the phone Planner (design handoff:
// docs/design/planner-mobile-and-recipes/README.md). Dates are plain
// "YYYY-MM-DD" keys, like everywhere in the planner.

// { year, month } (month 0-11) of a date key.
export function monthOf(key) {
  const d = parseDateKey(key);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export function shiftMonth({ year, month }, delta) {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

// The month as rows of 7 date keys, Monday first, padded with the days of the
// months either side so every row is whole. Always 6 rows, so the panel keeps
// its height as you flip months.
export function monthGrid({ year, month }) {
  const start = toDateKey(mondayOf(new Date(year, month, 1)));
  return Array.from({ length: 6 }, (_, row) => Array.from({ length: 7 }, (_, col) => addDays(start, row * 7 + col)));
}

// The first and last key the grid shows (what to ask the server for).
export function gridRange(monthValue) {
  const grid = monthGrid(monthValue);
  return { from: grid[0][0], to: grid[5][6] };
}

// The Monday of the week a day is in.
export function weekOf(key) {
  return toDateKey(mondayOf(parseDateKey(key)));
}

// Whether a day is in the week that starts on `weekStart`.
export function inWeek(key, weekStart) {
  return weekOf(key) === weekStart;
}

// The first day not fully in view when the board has scrolled `scrollLeft`
// px, or null when all 7 are. Columns are `col` wide with `gap` between, after
// `pad` of padding on the left.
export function firstHiddenDay({ scrollLeft, viewWidth, col = 104, gap = 8, pad = 14 }) {
  for (let i = 0; i < 7; i++) {
    const right = pad + i * (col + gap) + col;
    if (right > scrollLeft + viewWidth + 1) return i;
  }
  return null;
}

// The scroll position that puts a day's column in the middle of the view
// (never below 0 or past the end).
export function centerScroll({ day, viewWidth, col = 104, gap = 8, pad = 14 }) {
  const total = pad * 2 + 7 * col + 6 * gap;
  const target = pad + day * (col + gap) + col / 2 - viewWidth / 2;
  return Math.max(0, Math.min(Math.round(target), Math.max(0, total - viewWidth)));
}

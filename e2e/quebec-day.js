// The Quebec calendar day, worked out here on its own (not with the app's own
// lib/quebecDay.js) so a test checks the app against an independent answer.
const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" });

// "2026-10-12": the Quebec day a moment falls on.
export function quebecDay(at) {
  const parts = dayFormat.formatToParts(new Date(at));
  const part = (type) => parts.find((p) => p.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// The day that many days after a "2026-10-12" day.
export function addDays(key, days) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// A use-by day is saved as a bare date, which the database keeps as midnight UTC.
export const asSavedDay = (key) => `${key}T00:00:00.000Z`;

// The use-by (or sale end) day n Quebec days from today, as the Inventory form
// saves one ("2026-10-15"). Days left are counted in Quebec days, so a date made
// from the machine clock ("now + 2 days") lands on another day near midnight.
export const quebecDayIn = (n, at = Date.now()) => addDays(quebecDay(at), n);

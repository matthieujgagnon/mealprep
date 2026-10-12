// The Quebec calendar day. A date the app shows or counts is a day in Quebec, not
// a moment on this device's clock or the server's (UTC): at 11 p.m. in Quebec it
// is already the next day in UTC. This is the one rule for days left and for the
// day a use-by date means (Inventory, leftovers, Home, Makeable, the recipe card,
// Flyers), and server/src/lib/quebecDay.js is the same code for the server (the
// AI limit's "today"), kept in step by server/src/lib/quebecDay.test.js.
const TIME_ZONE = "America/Toronto";
const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const DAY_MS = 86400000;

// "2026-10-12": the Quebec day that moment falls on.
export function quebecDay(instant = new Date()) {
  const parts = dayFormat.formatToParts(instant);
  const part = (type) => parts.find((p) => p.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const dayNumber = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};

// The day that many days after (or before, when negative) a "2026-10-12" day.
export function addDays(key, days) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// How many days from one "2026-10-12" day to another (negative when it is before).
export function daysBetween(fromKey, toKey) {
  return Math.round(dayNumber(toKey) - dayNumber(fromKey));
}

// The day a saved use-by date means. A day that was typed or picked reaches the
// database as midnight UTC ("2026-10-16" is 2026-10-16T00:00:00Z), and that is
// the day it says, whatever the hour is in Quebec. Any other moment (a date the
// app worked out from a time, such as a USDA shelf life) is the Quebec day it
// falls on. null for no date or a bad one.
export function expiryDay(value) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  if (Number.isNaN(time)) return null;
  return time % DAY_MS === 0 ? date.toISOString().slice(0, 10) : quebecDay(date);
}

// Days from today until a use-by date, counted in Quebec calendar days: 0 on the
// day itself, 1 the day before, negative after. NaN for a bad date.
export function daysFromToday(value, now = new Date()) {
  const useBy = expiryDay(value);
  return useBy == null ? NaN : daysBetween(quebecDay(now), useBy);
}

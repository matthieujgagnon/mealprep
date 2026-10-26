// The Quebec calendar day, worked out here on its own (not with the app's own
// lib/quebecDay.js) so a test checks the app against an independent answer.
//
// Every function here takes the moment it counts from. None of them has the real clock as a default: a
// spec asks spec-clock.js for its moment (`specNow()`), so a spec run at a frozen moment counts from that
// moment everywhere, and a call that forgets the moment fails at once instead of quietly using today.
const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" });

// "2026-10-12": the Quebec day a moment falls on.
export function quebecDay(at) {
  if (at == null) throw new Error("quebecDay needs the moment to count from: pass specNow() from spec-clock.js");
  const parts = dayFormat.formatToParts(new Date(at));
  const part = (type) => parts.find((p) => p.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// The day that many days after a "2026-10-12" day.
export function addDays(key, days) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Where a moment falls in the Planner's week, counted on the Quebec day: which day of the week
// it is (0 = Monday ... 6 = Sunday) and the Monday ("2026-10-19") that starts that week. A
// machine's own date is a day ahead from 8 p.m. in Quebec when it runs on UTC (Friday evening
// reads as Saturday), so a meal planned from it can land on a day the Planner counts as past.
export function quebecDayOfWeek(at) {
  return (new Date(`${quebecDay(at)}T00:00:00Z`).getUTCDay() + 6) % 7;
}
export const quebecWeekStart = (at) => addDays(quebecDay(at), -quebecDayOfWeek(at));

// The moment it is `hour`:`minute` on a Quebec "2026-10-12" day: what the browser's clock is fixed to,
// to see the app at 8 a.m., or at 6 p.m. when supper is the card Home shows.
const clockFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
export function quebecMoment(key, hour = 12, minute = 0) {
  const [y, m, d] = key.split("-").map(Number);
  const wanted = Date.UTC(y, m - 1, d, hour, minute);
  // Quebec is 4 hours behind UTC in summer time and 5 in winter: keep the one that reads back as asked.
  for (const behind of [4, 5]) {
    const at = new Date(wanted + behind * 3600000);
    const part = Object.fromEntries(clockFormat.formatToParts(at).map((p) => [p.type, p.value]));
    if (`${part.year}-${part.month}-${part.day}` === key && Number(part.hour) === hour && Number(part.minute) === minute) return at;
  }
  throw new Error(`${hour}:${String(minute).padStart(2, "0")} on ${key} does not exist in Quebec`);
}

// A use-by day is saved as a bare date, which the database keeps as midnight UTC.
export const asSavedDay = (key) => `${key}T00:00:00.000Z`;

// The use-by (or sale end) day n Quebec days from today, as the Inventory form
// saves one ("2026-10-15"). Days left are counted in Quebec days, so a date made
// from the machine clock ("now + 2 days") lands on another day near midnight.
export const quebecDayIn = (n, at) => addDays(quebecDay(at), n);

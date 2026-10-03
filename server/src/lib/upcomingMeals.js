// Which planner entries are "from today onward", for the one grocery list
// that covers every planned meal that hasn't happened yet. An entry is a
// week (its Monday, "YYYY-MM-DD") and a day in it (0 = Monday), so today
// splits the plan into earlier weeks, this week's earlier days, and the rest.
// Pure calendar-date math on the day the browser sent (never a server-clock
// "today"), so it's the user's own today whatever timezone the server is in.

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

// A Prisma `where` for entries on or after `from` ("YYYY-MM-DD"), or null
// when `from` isn't a real date.
export function upcomingWhere(from) {
  if (typeof from !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return null;
  const [y, m, d] = from.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  if (dateKey(day) !== from) return null; // e.g. 2026-02-31 rolls over to March
  const dayOfWeek = (day.getUTCDay() + 6) % 7;
  const monday = dateKey(new Date(Date.UTC(y, m - 1, d - dayOfWeek)));
  return { OR: [{ weekStart: { gt: monday } }, { weekStart: monday, dayOfWeek: { gte: dayOfWeek } }] };
}

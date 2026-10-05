// Small rules behind Home's week strip and "To use" card.

// The meal that is "on" right now, for the all-meals week strip: breakfast
// before 10, lunch before 15, supper after. (Planner meal types: the supper
// slot is "dinner".)
export function currentMealType(date = new Date()) {
  const hour = date.getHours();
  if (hour < 10) return "breakfast";
  if (hour < 15) return "lunch";
  return "dinner";
}

// "To use" lists what expires within this many days; the soonest few show,
// the rest sit behind a link to Inventory.
export const TO_USE_DAYS = 14;
export const TO_USE_SHOWN = 5;

// How urgent an item is: pink at three days or fewer, yellow up to a week,
// blue after that.
export function useTone(daysLeft) {
  return daysLeft <= 3 ? "pink" : daysLeft <= 7 ? "yellow" : "blue";
}

// The freshness bar: a week's scale, nearly full on the last day.
export function useBarPct(daysLeft) {
  return Math.max(8, Math.min(96, Math.round((1 - daysLeft / 7) * 100)));
}

// The items to show in "To use": soonest first, only those not yet past
// their date and inside the window. { shown, rest } (rest is how many more).
export function toUseItems(items, daysUntil) {
  const pool = (items || [])
    .filter((i) => i.expiresAt && daysUntil(i.expiresAt) >= 0 && daysUntil(i.expiresAt) <= TO_USE_DAYS)
    .sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt));
  return { shown: pool.slice(0, TO_USE_SHOWN), rest: Math.max(0, pool.length - TO_USE_SHOWN) };
}

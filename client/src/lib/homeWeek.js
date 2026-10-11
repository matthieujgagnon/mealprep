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

// "Use it up" lists everything that expires within this many days (a month),
// soonest first. The card scrolls inside itself when they don't all fit.
export const TO_USE_DAYS = 30;
// "Cook with these" searches recipes for just the soonest few, so a month of
// items doesn't make one long search.
export const TO_USE_COOK = 5;

// How urgent an item is: pink at three days or fewer, yellow up to a week,
// blue after that.
export function useTone(daysLeft) {
  return daysLeft <= 3 ? "pink" : daysLeft <= 7 ? "yellow" : "blue";
}

// The freshness bar: a week's scale, nearly full on the last day.
export function useBarPct(daysLeft) {
  return Math.max(8, Math.min(96, Math.round((1 - daysLeft / 7) * 100)));
}

// Leftovers about to expire (this many days or fewer) come first in "Use it up":
// they are a meal ready to eat.
export const LEFTOVERS_FIRST_DAYS = 3;

// The items to show in "Use it up": leftovers about to expire first, then
// soonest first, only those not yet past their date and inside the window.
// { shown, soonest } (soonest is the few that "Cook with these" searches for:
// ingredients, not leftovers).
export function toUseItems(items, daysUntil) {
  const first = (i) => (i.isLeftover && daysUntil(i.expiresAt) <= LEFTOVERS_FIRST_DAYS ? 1 : 0);
  const shown = (items || [])
    .filter((i) => i.expiresAt && daysUntil(i.expiresAt) >= 0 && daysUntil(i.expiresAt) <= TO_USE_DAYS)
    .sort((a, b) => first(b) - first(a) || new Date(a.expiresAt) - new Date(b.expiresAt));
  return { shown, soonest: shown.filter((i) => !i.isLeftover).slice(0, TO_USE_COOK) };
}

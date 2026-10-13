import { t } from "../i18n/index.js";
import { daysBetween, quebecDay } from "./quebecDay.js";

// Inventory's "Recently removed" (« Récemment retirés »): what left Inventory in
// the last 7 Quebec days. The server keeps the list (server/src/lib/removedItems.js);
// this is how the page reads and words it.

// Anything that changes the list (a removal, an Undo, Put back) says so here once
// its save has landed (api.js), and the open Inventory reads the list again.
const listeners = new Set();
export function removedChanged(value) {
  for (const fn of listeners) fn();
  return value;
}
export function onRemovedChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// How it left: Used up, Tossed, Deleted or Cooked.
export function removedHowLabel(how) {
  return t(`inventory.removed.how.${["consumed", "wasted", "deleted", "cooked"].includes(how) ? how : "deleted"}`);
}

// When it left, in Quebec days: today, yesterday, or "3 days ago".
export function removedWhenLabel(removedAt, now = new Date()) {
  const days = daysBetween(quebecDay(new Date(removedAt)), quebecDay(now));
  if (days <= 0) return t("inventory.removed.today");
  if (days === 1) return t("inventory.removed.yesterday");
  return t("inventory.removed.daysAgo", { count: days });
}

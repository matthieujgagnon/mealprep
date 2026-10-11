import { formatFractionQuantity, unitLabel } from "./units.js";
import { roundAmount } from "./inventoryMatch.js";

// The plain logic behind the finished view (components/CookedView.jsx): which
// planned meal a cooked recipe is, how the "Take out of your Inventory" rows are
// grouped and counted, and what "Remove from inventory" sends.

// "900 g", "1 ½ cups", "4" (a plain count has no unit word).
export function amountText(qty, unit) {
  if (qty == null) return "";
  const u = unit && unit !== "unit" ? ` ${unitLabel(unit, qty)}` : "";
  return `${formatFractionQuantity(qty)}${u}`;
}

// A row with Matt's own changes on it (`edit`: { on?, amount? }), and what will be
// left after. An amount of zero or less switches the row off.
export function editedRow(row, edit = {}) {
  if (row.kind !== "item") return row;
  const amount = edit.amount !== undefined ? edit.amount : row.amount;
  const on = edit.on !== undefined ? edit.on : row.on;
  const usable = amount === "all" || (typeof amount === "number" && amount > 0);
  let after = null;
  if (amount === "all") after = 0;
  else if (typeof amount === "number" && row.before != null) after = roundAmount(Math.max(0, row.before - amount), row.item.unit);
  return { ...row, amount, on: on && usable, after };
}

// The rows in shelves, in the order the recipe first uses each shelf: Inventory
// items under their shelf, then the "always have" ones not in Inventory, then
// what isn't in Inventory at all. `shelfName(id)` names a shelf.
export function shelfGroups(rows, shelfName) {
  const groups = new Map();
  const add = (key, label, row) => {
    if (!groups.has(key)) groups.set(key, { key, label, rows: [] });
    groups.get(key).rows.push(row);
  };
  for (const row of rows) if (row.kind === "item") add(`shelf:${row.item.location}`, shelfName(row.item.location), row);
  for (const row of rows) if (row.kind === "staple") add("staple", null, row);
  for (const row of rows) if (row.kind === "missing") add("missing", null, row);
  return [...groups.values()];
}

// How many Inventory rows come out, out of how many, and how many stay.
export function takeOutCounts(rows) {
  const items = rows.filter((r) => r.kind === "item");
  const on = items.filter((r) => r.on).length;
  return { on, total: items.length, stays: items.length - on, pct: items.length ? Math.round((on / items.length) * 100) : 0 };
}

// What "Remove from inventory" sends: each switched-on row's amount, in its item's unit.
export function takesFrom(rows) {
  return rows.filter((r) => r.kind === "item" && r.on).map((r) => ({ id: r.item.id, amount: r.amount }));
}

const dateOf = (e) => {
  const [y, m, d] = e.weekStart.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + e.dayOfWeek));
  return date.toISOString().slice(0, 10);
};

// The planned meal that "I cooked this" in Cook mode marks: this recipe planned
// today, else its last one earlier this week, not a leftover and not cooked yet.
// None (cooked off-plan, or only planned later) marks nothing.
export function plannedMealFor(recipeId, entries, todayKey) {
  const seen = new Set();
  const mine = entries.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return (e.recipe?.id || e.recipeId) === recipeId && !e.isLeftover && !e.cookedAt && !e.recipe?.isPlaceholder;
  });
  const monday = (key) => {
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return date.toISOString().slice(0, 10);
  };
  const week = monday(todayKey);
  const today = mine.find((e) => dateOf(e) === todayKey);
  if (today) return today;
  return mine.filter((e) => e.weekStart === week && dateOf(e) < todayKey).sort((a, b) => dateOf(b).localeCompare(dateOf(a)))[0] || null;
}

// How many portions the Leftovers card starts on: one less than the servings
// cooked (someone ate tonight), or the leftover meals already planned for it,
// never more than were cooked.
export function startingPortions(servings, plannedCopies = 0) {
  const cooked = Math.max(1, Math.round(servings || 1));
  return Math.min(cooked, plannedCopies > 0 ? plannedCopies : Math.max(0, cooked - 1));
}

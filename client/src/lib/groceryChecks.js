import { convertToUnit } from "./units.js";
import { formatAmount } from "./groceryList.js";

// A check on the grocery list covers an AMOUNT, not just an ingredient: the
// amount the row showed when it was checked. "Done shopping" turns checked
// amounts into BOUGHT ones, which leave the list. A meal added later that
// needs more of the same ingredient shows the extra, unchecked.
//
// An amount is saved as a snapshot, { parts: [{ quantity, unit }], usedIn:
// [recipe titles] } - the same parts a list row has. `usedIn` is there for
// amounts nobody wrote down ("fresh basil"): a recipe that wasn't in the
// snapshot still needs buying for.
//
// `rows` below are the server's saved rows (GroceryCheckedItem), keyed by
// the list row's key: { covered, bought, inInventory }.

const EPS = 0.001;

// A row saved before amounts were kept: its check (or purchase) covers
// whatever the row needs, until tidyChecks saves the amount.
export const ALL = "all";

const copyPart = (p) => ({ quantity: p.quantity ?? null, unit: p.unit ?? null });

export function snapshotOf(parts, usedIn = []) {
  return { parts: parts.map(copyPart), usedIn: [...usedIn] };
}

// How much of `amount` (in `fromUnit`) fits into a part measured in `unit`:
// the same unit, or one it converts to (weight to weight, volume to volume).
function inUnit(amount, fromUnit, unit) {
  if ((fromUnit ?? null) === (unit ?? null)) return amount;
  return convertToUnit(amount, fromUnit, unit);
}

// Takes up to `amount` of `fromUnit` out of the measured parts in `left`
// (mutating them) and returns how much was taken, in `fromUnit`.
function takeFrom(left, amount, fromUnit) {
  let taken = 0;
  for (const p of left) {
    if (amount - taken <= EPS) break;
    const want = inUnit(amount - taken, fromUnit, p.unit);
    if (want == null) continue;
    const used = Math.min(p.quantity, want);
    p.quantity -= used;
    taken += used >= want - EPS ? amount - taken : inUnit(used, p.unit, fromUnit);
  }
  return taken;
}

// What of `parts` the snapshots don't cover. A snapshot covers a measured
// amount up to its quantity (across convertible units); an unmeasured part
// is covered when a snapshot has one too and no recipe is new to it.
export function uncoveredParts(parts, usedIn, snapshots) {
  const real = snapshots.filter(Boolean);
  if (real.includes(ALL)) return [];
  let left = parts.filter((p) => p.quantity != null).map(copyPart);
  for (const s of real) {
    for (const taken of s.parts) {
      if (taken.quantity != null) takeFrom(left, taken.quantity, taken.unit);
    }
    left = left.filter((p) => p.quantity > EPS);
  }
  const seen = new Set(real.flatMap((s) => s.usedIn));
  const newMeal = usedIn.some((title) => !seen.has(title));
  for (const p of parts.filter((x) => x.quantity == null)) {
    const covered = !newMeal && real.some((s) => s.parts.some((q) => q.quantity == null && (q.unit ?? null) === (p.unit ?? null)));
    if (!covered) left.push(copyPart(p));
  }
  return left;
}

// Trims a snapshot to what `needParts` still holds, so an amount saved for
// meals that have since left the plan can't cover a later one.
function clampSnapshot(snap, needParts, usedIn) {
  const room = needParts.filter((p) => p.quantity != null).map(copyPart);
  const parts = [];
  for (const s of snap.parts) {
    if (s.quantity == null) {
      if (needParts.some((p) => p.quantity == null && (p.unit ?? null) === (s.unit ?? null))) parts.push(copyPart(s));
      continue;
    }
    const taken = takeFrom(room, s.quantity, s.unit);
    if (taken > EPS) parts.push({ quantity: taken >= s.quantity - EPS ? s.quantity : taken, unit: s.unit ?? null });
  }
  if (parts.length === 0) return null;
  return { parts, usedIn: snap.usedIn.filter((title) => usedIn.includes(title)) };
}

function sameSnapshot(a, b) {
  if (!a || !b) return !a && !b;
  if (a.parts.length !== b.parts.length || a.usedIn.length !== b.usedIn.length) return false;
  if (!a.usedIn.every((title) => b.usedIn.includes(title))) return false;
  return a.parts.every(
    (p, i) =>
      (p.unit ?? null) === (b.parts[i].unit ?? null) &&
      (p.quantity == null ? b.parts[i].quantity == null : b.parts[i].quantity != null && Math.abs(p.quantity - b.parts[i].quantity) <= EPS)
  );
}

// A saved row as the two things it can mean: what's bought, what's in the cart.
function rowAmounts(row) {
  if (!row) return { bought: null, covered: null };
  return {
    bought: row.bought || (row.inInventory ? ALL : null),
    covered: row.covered || (!row.bought && !row.inInventory ? ALL : null),
  };
}

// The list as it should show: rows already bought are gone, a checked row
// stays checked while its check covers what's needed, and a row that needs
// more than was checked or bought shows only the extra, unchecked.
//   - `items`: the rows from buildGroceryList
//   - `rows`: key -> saved row
// Returns { items, checked, bought }: the rows to show (each with `parts` set
// to what's left, `needParts` the whole need, `toBuy` what a check would
// cover, `extra` true when `parts` is only the extra), the keys checked, and
// the rows that left the list as bought.
export function applyChecks(items, rows) {
  const shown = [];
  const checked = {};
  const bought = [];
  for (const item of items) {
    const amounts = rowAmounts(rows[item.key]);
    const toBuy = amounts.bought ? uncoveredParts(item.parts, item.usedIn, [amounts.bought]) : item.parts;
    if (amounts.bought && toBuy.length === 0) {
      bought.push(item);
      continue;
    }
    const left = amounts.covered ? uncoveredParts(item.parts, item.usedIn, [amounts.bought, amounts.covered]) : toBuy;
    const isChecked = !!amounts.covered && left.length === 0;
    if (isChecked) checked[item.key] = true;
    shown.push({
      ...item,
      needParts: item.parts,
      parts: isChecked ? toBuy : left,
      toBuy,
      extra: !isChecked && !!(amounts.bought || amounts.covered) && left.some((p) => p.quantity != null),
    });
  }
  return { items: shown, checked, bought };
}

// What checking a row covers: everything it still needs to buy.
export function checkSnapshot(item) {
  return snapshotOf(item.toBuy ?? item.parts, item.usedIn);
}

// `rows` with one row's check set (a snapshot) or cleared (null). A row left
// with nothing - not checked, nothing bought - is dropped.
export function setCovered(rows, key, covered) {
  const next = { ...rows };
  const row = rows[key];
  if (covered) next[key] = { bought: null, inInventory: false, ...row, covered };
  else if (row && (row.bought || row.inInventory)) next[key] = { ...row, covered: null };
  else delete next[key];
  return next;
}

// What "Done shopping" records for a checked row: it needed this much and now
// has it all.
export function boughtSnapshot(item) {
  return snapshotOf(item.needParts ?? item.parts, item.usedIn);
}

// Keeps the saved rows true to the plan. Pass every row of the list (staples
// and removed ones too) and only once the whole plan has loaded, since a row
// no planned meal needs is dropped. Returns { set, remove }:
//   - remove: rows nothing needs any more (its meals left the plan);
//   - set: rows to rewrite as { key, covered, bought } - a row saved before
//     amounts were kept gets the amount it showed, and an amount bigger than
//     what the meals need now is cut back.
export function tidyChecks(items, rows) {
  const byKey = new Map(items.map((item) => [item.key, item]));
  const set = [];
  const remove = [];
  for (const [key, row] of Object.entries(rows)) {
    const item = byKey.get(key);
    if (!item) {
      remove.push(key);
      continue;
    }
    let bought = row.bought || null;
    let covered = row.covered || null;
    if (!row.bought && row.inInventory) {
      bought = snapshotOf(item.parts, item.usedIn);
    } else if (!row.bought && !row.covered) {
      covered = snapshotOf(item.parts, item.usedIn);
    } else {
      if (bought) bought = clampSnapshot(bought, item.parts, item.usedIn);
      const after = bought ? uncoveredParts(item.parts, item.usedIn, [bought]) : item.parts;
      if (covered) covered = clampSnapshot(covered, after, item.usedIn);
    }
    if (!bought && !covered) {
      remove.push(key);
      continue;
    }
    if (row.inInventory || !sameSnapshot(bought, row.bought || null) || !sameSnapshot(covered, row.covered || null)) {
      set.push({ key, covered, bought });
    }
  }
  return { set, remove };
}

// The amount to show beside a row: your own amount, else what's left of the
// recipe amount ("+200 g" when it's only the extra).
export function recipeAmountLabel(item) {
  const amount = formatAmount(item.parts);
  return item.extra && amount ? `+${amount}` : amount;
}

export function amountLabel(item) {
  return item.customQuantity || recipeAmountLabel(item);
}

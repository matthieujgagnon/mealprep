// What taking amounts out of Inventory does to each item: the finished view's
// "Remove from inventory" after a meal is cooked, and a planned leftover's
// portion once its day has passed.
//
// `takes` is [{ id, amount }]: an amount in the item's own unit, or "all".
// Takes for the same item add up. An item that reaches zero (or that is
// taken "all") leaves Inventory; an item with no amount only leaves when it is
// taken "all", and is otherwise left as it is. Returns { updates: [{ id,
// quantity }], removes: [id] }.

const EPSILON = 1e-9;

export function validTakes(takes) {
  return (
    Array.isArray(takes) &&
    takes.length > 0 &&
    takes.every(
      (t) =>
        t &&
        typeof t.id === "string" &&
        (t.amount === "all" || (typeof t.amount === "number" && Number.isFinite(t.amount) && t.amount > 0))
    )
  );
}

export function planTakeOut(items, takes) {
  const wanted = new Map();
  for (const { id, amount } of takes) {
    const prev = wanted.get(id);
    wanted.set(id, prev === "all" || amount === "all" ? "all" : (prev || 0) + amount);
  }
  const updates = [];
  const removes = [];
  for (const item of items) {
    if (!wanted.has(item.id)) continue;
    const amount = wanted.get(item.id);
    if (amount === "all") {
      removes.push(item.id);
      continue;
    }
    if (item.quantity == null) continue;
    const left = item.quantity - amount;
    if (left <= EPSILON) removes.push(item.id);
    else updates.push({ id: item.id, quantity: Math.round(left * 1000) / 1000 });
  }
  return { updates, removes };
}

// The planned leftover meals whose day has passed and whose portion hasn't
// come off yet, as one portion per meal for each Inventory item.
export function portionsDue(entries) {
  const due = new Map();
  for (const e of entries) {
    if (!e.isLeftover || !e.leftoverItemId || e.cookedAt) continue;
    due.set(e.leftoverItemId, (due.get(e.leftoverItemId) || 0) + 1);
  }
  return [...due].map(([id, amount]) => ({ id, amount }));
}

// The foods the Add item form offers as "Recent" chips: the last few distinct
// names you put in Inventory or used up, newest first. An item still in
// Inventory also gives its amount, unit and shelf, so tapping the chip can
// fill them in; a used-up one gives only its name.
export function mergeRecent(items, logs, limit = 8) {
  const entries = [
    ...items.map((i) => ({ name: i.name, at: new Date(i.createdAt).getTime(), quantity: i.quantity ?? null, unit: i.unit ?? null, location: i.location ?? null })),
    ...logs.map((l) => ({ name: l.name, at: new Date(l.createdAt).getTime(), quantity: null, unit: null, location: null })),
  ].sort((a, b) => b.at - a.at);
  const seen = new Set();
  const out = [];
  for (const entry of entries) {
    const key = String(entry.name || "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ name: entry.name.trim(), quantity: entry.quantity, unit: entry.unit, location: entry.location });
    if (out.length >= limit) break;
  }
  return out;
}

// "Did the import work?" in numbers, for the Flyers page's import check:
// what each store's flyer gave this week, which prices couldn't be read,
// how many deals have something to be compared with, how many weeks of
// prices are stored, and old prices that were saved per item but were
// really per lb (from before the price reader understood "/lb 2.18/kg").
import { comparablePrice, productWords } from "./priceCompare.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const weekStart = (date) => {
  const d = new Date(date);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString().slice(0, 10);
};
const keyOf = (row) => productWords(row.matchName || row.item).join(" ");

// `current`: this week's deals as GET /api/deals builds them (with
// rangeSource / isNew). `history`: earlier weeks' rows (isCurrent false)
// of the last 26 weeks: { id, store, source, item, matchName, price,
// unitPrice, unitBasis, createdAt }.
export function buildImportReport(current, history) {
  const byStore = new Map();
  for (const d of current) {
    const k = `${d.store}|${d.source || ""}`;
    if (!byStore.has(k)) {
      byStore.set(k, { store: d.store, source: d.source || null, items: 0, priced: 0, perUnit: 0, photos: 0, endsOn: null, importedAt: null });
    }
    const s = byStore.get(k);
    s.items++;
    if (d.unitPrice != null && d.unitBasis) s.priced++;
    const cmp = comparablePrice(d);
    if (cmp && cmp.basis !== "each") s.perUnit++;
    if (d.imageUrl) s.photos++;
    if (d.validUntil && (!s.endsOn || d.validUntil > s.endsOn)) s.endsOn = d.validUntil;
    const at = d.createdAt ? new Date(d.createdAt).toISOString() : null;
    if (at && (!s.importedAt || at > s.importedAt)) s.importedAt = at;
  }

  const unreadable = current
    .filter((d) => d.unitPrice == null || !d.unitBasis)
    .slice(0, 25)
    .map((d) => ({ store: d.store, item: d.item, price: d.price }));

  const compared = { store: 0, stores: 0, quebec: 0, none: 0 };
  for (const d of current) {
    if (d.unitPrice == null || !d.unitBasis) continue;
    if (d.isNew || !d.rangeSource) compared.none++;
    else compared[d.rangeSource] = (compared[d.rangeSource] || 0) + 1;
  }

  const weeks = new Map();
  for (const row of history) {
    const w = weekStart(row.createdAt);
    if (!weeks.has(w)) weeks.set(w, { week: w, rows: 0, sources: new Set() });
    const entry = weeks.get(w);
    entry.rows++;
    if (row.source) entry.sources.add(row.source);
  }
  const historyWeeks = [...weeks.values()]
    .sort((a, b) => b.week.localeCompare(a.week))
    .map((w) => ({ week: w.week, rows: w.rows, sources: [...w.sources].sort() }));

  return {
    stores: [...byStore.values()].sort((a, b) => a.store.localeCompare(b.store)),
    total: current.length,
    unreadable,
    unreadableCount: current.filter((d) => d.unitPrice == null || !d.unitBasis).length,
    compared,
    historyWeeks,
    fixable: findPerLbSavedEach(current, history),
  };
}

// Earlier Flipp prices saved per item that were per lb: the same product at
// the same store is priced per lb this week, and the old price is within
// half to double of it (a per-lb price, not a whole pack's).
export function findPerLbSavedEach(current, history) {
  const perLbNow = new Map();
  for (const d of current) {
    if (d.source !== "Flipp" || d.unitBasis !== "lb" || d.unitPrice == null) continue;
    perLbNow.set(`${d.store}|${keyOf(d)}`, d.unitPrice);
  }
  const rows = [];
  for (const row of history) {
    if (row.source !== "Flipp" || row.unitBasis !== "each" || row.unitPrice == null) continue;
    const now = perLbNow.get(`${row.store}|${keyOf(row)}`);
    if (now == null) continue;
    if (row.unitPrice >= now * 0.5 && row.unitPrice <= now * 2) rows.push({ id: row.id, store: row.store, item: row.item, price: row.price, unitPrice: row.unitPrice });
  }
  return rows;
}

// Earlier Flipp rows that saved an amount off as the price (Super C's
// "rabais de 3$" wine as "$3.00 each"): this week the same product at the
// same store reads "$3.00 off", and the old row's price is that amount.
export function findAmountOffSavedAsPrice(current, history) {
  const offNow = new Map();
  for (const d of current) {
    const m = d.source === "Flipp" && d.unitPrice == null && /^\$(\d+(?:\.\d+)?) off$/.exec(d.price || "");
    if (m) offNow.set(`${d.store}|${keyOf(d)}`, Number(m[1]));
  }
  const rows = [];
  for (const row of history) {
    if (row.source !== "Flipp" || row.unitBasis !== "each" || row.unitPrice == null) continue;
    const amount = offNow.get(`${row.store}|${keyOf(row)}`);
    if (amount != null && Math.abs(row.unitPrice - amount) < 0.005) rows.push({ id: row.id, store: row.store, item: row.item, price: row.price, amount });
  }
  return rows;
}

export const HISTORY_WINDOW_MS = 26 * WEEK_MS;

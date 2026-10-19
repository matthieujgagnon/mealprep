import { formatFractionQuantity, parseQuantityInput } from "./units.js";
import { formatDayRange } from "../i18n/format.js";
import { addDays, daysBetween, quebecDay, expiryDay } from "./quebecDay.js";

// The logic behind the Inventory item form (Add item and Edit item), kept apart
// from the screen so it can be tested. Design: docs/design/inventory-item-form/.

// When USDA has nothing for a food: how long it is guessed to last on a shelf
// (a shelf of your own counts as the pantry). The form says so ("Rough estimate").
export const FALLBACK_DAYS = { fridge: 14, freezer: 90, pantry: 180 };

export function fallbackDays(location) {
  return FALLBACK_DAYS[location] ?? FALLBACK_DAYS.pantry;
}

// The use-by shortcuts, in days from today.
export const USE_BY_CHIPS = [
  { id: "3d", days: 3 },
  { id: "1w", days: 7 },
  { id: "2w", days: 14 },
  { id: "1m", days: 30 },
  { id: "3m", days: 90 },
];

// The quick amounts under the stepper.
export const ADD_QUICK = [["¼", 1 / 4], ["⅓", 1 / 3], ["½", 1 / 2], ["¾", 3 / 4], ["1", 1], ["2", 2], ["6", 6], ["12", 12]];
export const EDIT_QUICK = [["¼", 1 / 4], ["⅓", 1 / 3], ["½", 1 / 2], ["⅔", 2 / 3], ["¾", 3 / 4], ["1", 1]];

// "2026-10-18" for the day that many days from today. Today is the Quebec day
// (lib/quebecDay.js), whatever this device's clock says.
export function dateFromDays(days, today = new Date()) {
  return addDays(quebecDay(today), days);
}

// How many days from today a "2026-10-18" date is (negative once it has passed);
// null for no date or a bad one.
export function daysFromDate(dateStr, today = new Date()) {
  const m = String(dateStr || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? daysBetween(quebecDay(today), m[1]) : null;
}

// The use-by days a shelf starts with: USDA's middle figure for this food on
// this shelf, else the rough guess for the shelf. `usda` says which.
export function startDays(data, location) {
  if (data && Number.isFinite(data.defaultDays)) return { days: Math.max(1, Math.round(data.defaultDays)), usda: true };
  return { days: fallbackDays(location), usda: false };
}

// Grams and millilitres go 50 at a time, bottles and loaves a quarter, the rest one.
export function qtyStep(unit) {
  return unit === "g" || unit === "ml" ? 50 : unit === "bottle" || unit === "loaf" ? 0.25 : 1;
}

// The amount text after pressing − or +: never below 0, shown with fractions.
export function stepQuantity(text, unit, dir) {
  const current = parseQuantityInput(text);
  const base = current == null || current < 0 ? 0 : current;
  const next = Math.max(0, Math.round((base + dir * qtyStep(unit)) * 100) / 100);
  return formatFractionQuantity(next);
}

// What was typed in the amount box: "0.25", "1/2", "½", "1 1/2" and "1½" are
// numbers; anything else (or below 0) puts back what was there.
export function commitQuantity(typed, previous) {
  const value = parseQuantityInput(typed);
  if (value == null || value < 0) return previous;
  return formatFractionQuantity(Math.round(value * 1000) / 1000);
}

// The tag under the preview card: how soon it expires, and its colour.
//   tone: none (no date), hot (2 days or less, or expired), warn (a week or less), plain
// The use-by day itself is not expired yet: 0 days is "today", and only a day
// before today (below 0) is expired.
export function expiryTag(days) {
  if (days == null) return { kind: "none", tone: "none" };
  const tone = days <= 2 ? "hot" : days <= 7 ? "warn" : "plain";
  if (days < 0) return { kind: "expired", tone };
  if (days === 0) return { kind: "today", tone };
  if (days <= 1) return { kind: "tomorrow", tone };
  if (days < 60) return { kind: "days", count: days, tone };
  return { kind: "months", count: Math.round(days / 30), tone };
}

// How much shelf life is left, on a 4-week scale (Matt's Inventory design,
// docs/design/riso-v2-inventory-compact-tiles/): full and blue when fresh, a short
// stub near the end, full and pink once expired. Pink within 3 days (the use-by
// day itself included: it is not expired) or expired, yellow within a week, blue
// after. `height` is the strip down a Compact row's edge (none from 28 days on);
// `width` is the bar along a tile's bottom (full from 28 days on). No date, null:
// no strip, an empty bar. Days are Quebec days (`daysUntil`); expired is days < 0.
export const LINE_DAYS = 28;
export function lineForDays(days) {
  if (days == null) return null;
  if (days < 0) return { expired: true, color: "pink", height: "100%", width: "100%" };
  const color = days <= 3 ? "pink" : days <= 7 ? "yellow" : "blue";
  if (days >= LINE_DAYS) return { color, height: null, width: "100%" };
  const left = `${Math.max(8, Math.round((days / LINE_DAYS) * 100))}%`;
  return { color, height: left, width: left };
}

// Which sentence goes under the use-by chips.
export function useByKind({ days, custom, usda }) {
  if (days == null) return "none";
  if (days < 0) return "expired";
  if (custom) return "custom";
  return usda ? "usda" : "rough";
}

// The new item the Add form saves.
export function buildAddPayload({ name, qtyText, unit, location, category, expiresAt, photo, isPreparedMeal }) {
  const quantity = parseQuantityInput(qtyText);
  const payload = {
    name: name.trim(),
    quantity: quantity == null ? 1 : Math.round(quantity * 1000) / 1000,
    unit: unit || null,
    location,
    category: category || "Other",
    expiresAt: expiresAt || null,
  };
  if (photo) payload.imageUrl = photo;
  if (isPreparedMeal) payload.isPreparedMeal = true;
  return payload;
}

// What Save changes sends: only what differs from the saved item.
export function buildEditPatch(item, draft) {
  const patch = {};
  const name = draft.name.trim();
  if (name && name !== item.name) patch.name = name;
  const quantity = parseQuantityInput(draft.qtyText);
  if (quantity != null && Math.round(quantity * 1000) / 1000 !== (item.quantity ?? null)) patch.quantity = Math.round(quantity * 1000) / 1000;
  if ((draft.unit || null) !== (item.unit || null)) patch.unit = draft.unit || null;
  if (draft.location !== item.location) patch.location = draft.location;
  const saved = expiryDay(item.expiresAt) || "";
  if ((draft.expiresAt || "") !== saved) patch.expiresAt = draft.expiresAt || null;
  if ((draft.photo ?? null) !== (item.imageUrl ?? null)) patch.imageUrl = draft.photo ?? null;
  // The Prepared meal switch (not given for a leftover, which is already a meal).
  if (draft.isPreparedMeal !== undefined && draft.isPreparedMeal !== (item.isPreparedMeal === true)) patch.isPreparedMeal = draft.isPreparedMeal;
  return patch;
}

// "3–6 months" / "3 à 6 mois" from the USDA range the server sends.
export function rangeText(data) {
  return data.minDays != null && data.maxDays != null ? formatDayRange(data.minDays, data.maxDays) : data.rangeLabel;
}

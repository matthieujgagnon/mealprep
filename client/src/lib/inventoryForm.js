import { formatFractionQuantity, parseQuantityInput } from "./units.js";
import { formatDayRange } from "../i18n/format.js";

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

const pad = (n) => String(n).padStart(2, "0");

// "2026-10-18" for the day that many days from today (local time).
export function dateFromDays(days, today = new Date()) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// How many days from today a "2026-10-18" date is (negative once it has passed);
// null for no date or a bad one.
export function daysFromDate(dateStr, today = new Date()) {
  const m = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - start) / 86400000);
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
export function expiryTag(days) {
  if (days == null) return { kind: "none", tone: "none" };
  const tone = days <= 2 ? "hot" : days <= 7 ? "warn" : "plain";
  if (days <= 0) return { kind: "expired", tone };
  if (days <= 1) return { kind: "tomorrow", tone };
  if (days < 60) return { kind: "days", count: days, tone };
  return { kind: "months", count: Math.round(days / 30), tone };
}

// The line down a card's left edge (the same as on the shelf): how close the date
// is on a 4-week scale, filling up as it nears, pink within 3 days, yellow within
// a week, blue after. None from 28 days on or with no date; expired has its own tag.
export const LINE_DAYS = 28;
export function lineForDays(days) {
  if (days == null || days >= LINE_DAYS) return null;
  if (days <= 0) return { expired: true };
  const color = days <= 3 ? "pink" : days <= 7 ? "yellow" : "blue";
  return { height: `${Math.max(8, Math.round((1 - days / LINE_DAYS) * 100))}%`, color };
}

// Which sentence goes under the use-by chips.
export function useByKind({ days, custom, usda }) {
  if (days == null) return "none";
  if (days <= 0) return "expired";
  if (custom) return "custom";
  return usda ? "usda" : "rough";
}

// The new item the Add form saves.
export function buildAddPayload({ name, qtyText, unit, location, category, expiresAt, photo }) {
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
  const saved = item.expiresAt ? String(item.expiresAt).slice(0, 10) : "";
  if ((draft.expiresAt || "") !== saved) patch.expiresAt = draft.expiresAt || null;
  if ((draft.photo ?? null) !== (item.imageUrl ?? null)) patch.imageUrl = draft.photo ?? null;
  return patch;
}

// "3–6 months" / "3 à 6 mois" from the USDA range the server sends.
export function rangeText(data) {
  return data.minDays != null && data.maxDays != null ? formatDayRange(data.minDays, data.maxDays) : data.rangeLabel;
}

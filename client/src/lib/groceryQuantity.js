import { formatQuantity, getUnitClass, parseQuantityInput } from "./units.js";

// The grocery item's two amounts.
//   quantity        a plain number: how many to buy. The only thing you edit.
//   recipe quantity what the recipes need in total, with its unit ("350 g",
//                   "3 boîtes", "+200 g"). Read-only, and the only place a unit shows.
// An own quantity is saved in GroceryItemOverride.quantity as text. Older ones
// may carry a unit ("2 packs"); the number is what shows, and the unit text is
// kept in the saved value (it still goes to the Inventory sheet).

const NUMBER_FIRST = /^(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?)\s*(.*)$/;

// A saved own quantity -> { text: "2", quantity: 2, unitText: "packs" }, or null.
export function ownAmount(saved) {
  const m = String(saved ?? "").trim().match(NUMBER_FIRST);
  if (!m) return null;
  const text = m[1].replace(/\s+/g, "");
  const quantity = parseQuantityInput(text);
  if (quantity == null) return null;
  return { text, quantity, unitText: m[2].trim() };
}

// A unit you count, or none at all: the recipe's number is also how many to buy.
// A weight or a volume is not (350 g is one package, not 350 of anything).
export function isCountUnit(unit) {
  if (!unit) return true;
  return !getUnitClass(unit) && !["pinch", "dash"].includes(unit);
}

// How many to buy before you've set it: a hand-added item's own number, the
// recipe's number when it counts things, else 1.
export function defaultQuantity(item) {
  const parts = item.parts || [];
  if (item.isManual) {
    const q = parts[0]?.quantity ?? item.quantity;
    return q != null && q > 0 ? formatQuantity(q) : "1";
  }
  if (parts.length === 1 && parts[0].quantity != null && parts[0].quantity > 0 && isCountUnit(parts[0].unit)) {
    return formatQuantity(parts[0].quantity);
  }
  return "1";
}

// The number in the quantity field.
export function displayQuantity(item) {
  return ownAmount(item.customQuantity)?.text ?? defaultQuantity(item);
}

// What you typed in the quantity field -> what to save: null when it's the
// default (no override), a number as text, or undefined when it isn't a number
// (the field goes back to what it was).
export function quantityToSave(raw, item) {
  const text = String(raw ?? "").trim().replace(/\s+/g, "");
  if (!text) return null;
  const value = parseQuantityInput(text);
  if (value == null || value <= 0) return undefined;
  return text === defaultQuantity(item) ? null : text;
}

// Only digits, a decimal point or comma and a slash can be typed.
export function cleanQuantityTyping(raw) {
  return String(raw ?? "").replace(/[^0-9.,/]/g, "");
}

// What the Inventory confirmation sheet starts with for one item.
//   an older own quantity with a unit ("2 packs")   -> that
//   your number, when the recipe counts things      -> your number, in the recipe's unit
//   your number, when the recipe is a weight/volume -> the recipe quantity (350 g)
//   no own quantity                                 -> the recipe quantity, as before
export function inventoryAmount(item) {
  const own = ownAmount(item.customQuantity);
  const first = item.parts?.[0] ?? null;
  const recipe = { quantity: first?.quantity ?? null, unit: first?.unit ?? null };
  if (own && own.unitText) return { quantity: own.quantity, unit: own.unitText };
  if (own) {
    if (!first || isCountUnit(first.unit)) return { quantity: own.quantity, unit: first?.unit ?? null };
    return recipe;
  }
  if (item.customQuantity) return { quantity: null, unit: null };
  return recipe;
}

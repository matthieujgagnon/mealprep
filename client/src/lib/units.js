import { getLang, t } from "../i18n/index.js";

// Conversion factors to a common base unit per class.
// Weight base: grams. Volume base: milliliters.
const WEIGHT_TO_G = {
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
};

const VOLUME_TO_ML = {
  ml: 1,
  l: 1000,
  tsp: 4.92892,
  tbsp: 14.7868,
  cup: 236.588,
  fl_oz: 29.5735,
};

// Parses a quantity typed as free text — accepts a fraction ("1/4"), a mixed
// number ("1 1/2"), a plain decimal ("0.25"), a unicode fraction ("½"), a
// mixed one ("1½", "1 ½"), or an empty string. Recipe entry shouldn't
// require converting "1/4 cup" to "0.25" in your head first.
// Returns a number, or null if the input is empty/unparseable.
const UNICODE_FRACTIONS = { "¼": 1 / 4, "½": 1 / 2, "¾": 3 / 4, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 1 / 8, "⅜": 3 / 8, "⅝": 5 / 8, "⅞": 7 / 8 };
export function parseQuantityInput(raw) {
  if (raw == null) return null;
  const str = String(raw).trim().replace(/(\d),(\d)/g, "$1.$2");
  if (!str) return null;

  const plain = Number(str);
  if (Number.isFinite(plain)) return plain;

  // Whole numbers, fractions and unicode fractions, added up: "1 1/2",
  // "1½", "1 ½".
  const parts = str.replace(/(\d)([¼½¾⅓⅔⅛⅜⅝⅞])/g, "$1 $2").split(/\s+/);
  let total = 0;
  for (const part of parts) {
    let m;
    if (UNICODE_FRACTIONS[part] != null) total += UNICODE_FRACTIONS[part];
    else if ((m = part.match(/^(\d+)\/(\d+)$/))) {
      if (Number(m[2]) === 0) return null;
      total += Number(m[1]) / Number(m[2]);
    } else if (/^\d*\.?\d+$/.test(part)) total += Number(part);
    else return null;
  }
  return total;
}

// How the inventory shows an amount: fractions where they fit (¼ ⅓ ½ ⅔ ¾
// and eighths, "1 ½"), else a decimal of up to 2 places.
const GLYPHS = [
  [1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [3 / 8, "⅜"], [1 / 2, "½"], [5 / 8, "⅝"], [2 / 3, "⅔"], [3 / 4, "¾"], [7 / 8, "⅞"],
];
export function formatFractionQuantity(qty) {
  if (qty == null || !Number.isFinite(Number(qty))) return "";
  const q = Number(qty);
  const whole = Math.floor(q + 1e-6);
  const frac = q - whole;
  if (frac < 0.01) return String(whole);
  const glyph = GLYPHS.find(([v]) => Math.abs(v - frac) < 0.01);
  if (!glyph) return decimal(Math.round(q * 100) / 100);
  return whole ? `${whole} ${glyph[1]}` : glyph[1];
}

// A quick-pick chip (¼ ⅓ ½ ⅔ ¾ 1): a fraction keeps the whole part when
// that makes the amount bigger ("2" + ½ = 2 ½), else it becomes the
// amount; 1 sets it to 1.
export function pickFraction(current, value) {
  const q = Number(current) || 0;
  const whole = Math.floor(q + 1e-6);
  if (value < 1 && whole + value > q) return Math.round((whole + value) * 1000) / 1000;
  return value;
}

// The inverse of parseQuantityInput's fraction parsing — formats a scaled
// quantity back into "1 1/2" rather than "1.5", since that's how a recipe
// actually reads. Plain "1/2" rather than unicode fraction glyphs — IBM
// Plex Mono doesn't carry those glyphs, so they'd render as fallback/tofu
// symbols wherever this shows up (the ingredient list, scaled step text).
export function formatQuantity(qty) {
  if (qty === null || qty === undefined) return "";
  const rounded = Math.round(qty * 100) / 100;
  const whole = Math.floor(rounded);
  const frac = rounded - whole;
  const fracMap = { 0.25: "1/4", 0.5: "1/2", 0.75: "3/4", 0.33: "1/3", 0.67: "2/3" };
  const nearestFrac = Object.keys(fracMap).find((f) => Math.abs(f - frac) < 0.05);
  if (nearestFrac) {
    return `${whole > 0 ? whole + " " : ""}${fracMap[nearestFrac]}`;
  }
  return decimal(rounded);
}

// 1.5 -> "1.5" / "1,5"
function decimal(n) {
  const text = String(n);
  return getLang() === "fr" ? text.replace(".", ",") : text;
}

function unitClass(unit) {
  if (!unit) return null;
  const u = unit.toLowerCase();
  if (WEIGHT_TO_G[u]) return "weight";
  if (VOLUME_TO_ML[u]) return "volume";
  return null; // e.g. "pinch", "clove" — not convertible
}

// Exposed so other modules (groceryList.js) can group ingredients by unit
// *class* (all weights together, all volumes together) instead of requiring
// a literal unit match — e.g. "2 tbsp" and "3 tsp" of the same ingredient
// should combine into one grocery line, not two.
export function getUnitClass(unit) {
  return unitClass(unit);
}

// Converts a quantity from one unit to another *within the same class*
// (weight<->weight or volume<->volume only — no cross-class density guess,
// unlike convertIngredient below, since silently guessing density when
// merging grocery quantities could produce a misleading total). Returns
// null if the units aren't in the same convertible class.
export function convertToUnit(quantity, fromUnit, toUnit) {
  if (quantity == null || !fromUnit || !toUnit) return null;
  const from = fromUnit.toLowerCase();
  const to = toUnit.toLowerCase();
  if (from === to) return quantity;
  const cls = unitClass(from);
  if (!cls || unitClass(to) !== cls) return null;
  if (cls === "weight") {
    return (quantity * WEIGHT_TO_G[from]) / WEIGHT_TO_G[to];
  }
  return (quantity * VOLUME_TO_ML[from]) / VOLUME_TO_ML[to];
}

export const UNIT_SYSTEMS = ["original", "oz", "tbsp"].map((id) => ({
  id,
  get label() {
    return t(`units.systems.${id}`);
  },
}));

/**
 * Converts a {quantity, unit} pair into the target system.
 * Returns { quantity, unit, approximate } — approximate is true when we had
 * to cross weight<->volume, which assumes water-like density and won't be
 * exact for things like flour, honey, or grated cheese.
 */
export function convertIngredient(quantity, unit, targetSystem) {
  if (targetSystem === "original" || quantity == null || !unit) {
    return { quantity, unit, approximate: false };
  }

  const cls = unitClass(unit);
  if (!cls) {
    // Not a convertible unit (e.g. "clove", "pinch") — leave as-is.
    return { quantity, unit, approximate: false };
  }

  if (targetSystem === "oz") {
    if (cls === "weight") {
      const grams = quantity * WEIGHT_TO_G[unit.toLowerCase()];
      return { quantity: grams / WEIGHT_TO_G.oz, unit: "oz", approximate: false };
    }
    // volume -> weight ounces requires a density assumption
    const ml = quantity * VOLUME_TO_ML[unit.toLowerCase()];
    const grams = ml; // assume ~1g/ml (water-like)
    return { quantity: grams / WEIGHT_TO_G.oz, unit: "oz", approximate: true };
  }

  if (targetSystem === "tbsp") {
    if (cls === "volume") {
      const ml = quantity * VOLUME_TO_ML[unit.toLowerCase()];
      return { quantity: ml / VOLUME_TO_ML.tbsp, unit: "tbsp", approximate: false };
    }
    // weight -> volume tbsp requires a density assumption
    const grams = quantity * WEIGHT_TO_G[unit.toLowerCase()];
    const ml = grams; // assume ~1g/ml (water-like)
    return { quantity: ml / VOLUME_TO_ML.tbsp, unit: "tbsp", approximate: true };
  }

  return { quantity, unit, approximate: false };
}

// Units offered when entering an ingredient or an Inventory item, grouped
// the way a cook thinks about them. "unit" is the plain count ("3 units red
// bell pepper"); "piece" a piece of something bigger. A block of cheese, a
// stick of butter, a loaf of bread, a fillet of fish, a portion of leftovers
// are things you count; a carton of milk or a tub of yogurt is the package.
export const UNIT_GROUPS = [
  { id: "count", units: ["unit", "piece", "slice", "block", "stick", "loaf", "fillet", "portion", "dozen"] },
  { id: "produce", units: ["clove", "head", "bunch", "stalk", "sprig", "leaf", "handful"] },
  { id: "package", units: ["can", "jar", "bottle", "carton", "tub", "package", "box", "bag"] },
  { id: "volume", units: ["tsp", "tbsp", "cup", "fl_oz", "ml", "l"] },
  { id: "weight", units: ["g", "kg", "oz", "lb"] },
  { id: "little", units: ["pinch", "dash"] },
].map((group) => ({
  ...group,
  get label() {
    return t(`units.groups.${group.id}`);
  },
}));

const SAME_IN_BOTH = { g: "g", kg: "kg", mg: "mg", ml: "ml", l: "L", oz: "oz", lb: "lb" };

// How a unit reads next to an amount: "3 units", "1 clove", "2 bunches",
// "250 ml", "1 L", "4 fl oz" ("3 unités", "1 gousse", "2 bottes", "2 c. à
// soupe" in French). Abbreviations never take a plural. French counts
// anything under 2 as one ("1,5 tasse"). A unit saved before it was on
// the list reads as it was typed.
export function unitLabel(unit, qty = 1) {
  if (!unit) return "";
  if (SAME_IN_BOTH[unit]) return SAME_IN_BOTH[unit];
  const forms = t(`units.names.${unit}`, { count: 1 }) === `units.names.${unit}` ? null : unit;
  if (!forms) return unit;
  const plural = qty != null && (getLang() === "fr" ? qty >= 2 : qty > 1);
  return t(`units.names.${unit}`, { count: plural ? 2 : 1 });
}

// Dropdown label for a unit on its own ("units", "fl oz", "L").
export function unitOptionLabel(unit) {
  return unitLabel(unit, 2);
}

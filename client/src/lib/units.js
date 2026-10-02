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
// number ("1 1/2"), a plain decimal ("0.25"), or an empty string. Recipe
// entry shouldn't require converting "1/4 cup" to "0.25" in your head first.
// Returns a number, or null if the input is empty/unparseable.
export function parseQuantityInput(raw) {
  if (raw == null) return null;
  const str = String(raw).trim();
  if (!str) return null;

  const mixed = str.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const [, whole, num, den] = mixed;
    return Number(den) === 0 ? null : Number(whole) + Number(num) / Number(den);
  }

  const fraction = str.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const [, num, den] = fraction;
    return Number(den) === 0 ? null : Number(num) / Number(den);
  }

  const value = Number(str);
  return Number.isFinite(value) ? value : null;
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
  return String(rounded);
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

export const UNIT_SYSTEMS = [
  { id: "original", label: "As written" },
  { id: "oz", label: "Ounces (oz)" },
  { id: "tbsp", label: "Tablespoons (tbsp)" },
];

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
  {
    label: "Count",
    units: ["unit", "piece", "slice", "block", "stick", "loaf", "fillet", "portion", "dozen"],
  },
  { label: "Produce", units: ["clove", "head", "bunch", "stalk", "sprig", "leaf", "handful"] },
  { label: "Package", units: ["can", "jar", "bottle", "carton", "tub", "package", "box", "bag"] },
  { label: "Volume", units: ["tsp", "tbsp", "cup", "fl_oz", "ml", "l"] },
  { label: "Weight", units: ["g", "kg", "oz", "lb"] },
  { label: "A little", units: ["pinch", "dash"] },
];

const ABBREVIATED = new Set(["g", "kg", "mg", "ml", "l", "tsp", "tbsp", "oz", "lb", "fl_oz"]);
const IRREGULAR_PLURAL = { dozen: "dozen", leaf: "leaves", loaf: "loaves" };

// How a unit reads next to an amount: "3 units", "1 clove", "2 bunches",
// "250 ml", "1 L", "4 fl oz". Abbreviations never take a plural.
export function unitLabel(unit, qty = 1) {
  if (!unit) return "";
  if (unit === "l") return "L";
  if (unit === "fl_oz") return "fl oz";
  if (ABBREVIATED.has(unit) || qty == null || qty <= 1) return unit;
  if (IRREGULAR_PLURAL[unit]) return IRREGULAR_PLURAL[unit];
  if (/(ch|sh|s|x)$/.test(unit)) return `${unit}es`;
  return `${unit}s`;
}

// Dropdown label for a unit on its own ("units", "fl oz", "L").
export function unitOptionLabel(unit) {
  return unitLabel(unit, 2);
}

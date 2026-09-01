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

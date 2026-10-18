import { UNIT_GROUPS, convertToUnit, formatQuantity, unitLabel } from "./units.js";
import { formatNumber } from "../i18n/format.js";
import { getLang } from "../i18n/index.js";
import { canonicalUnit, canonicalize, capitalize, singularize } from "./ingredientNames.js";
import { foodsOnLine } from "./inventoryMatch.js";

export { canonicalUnit, canonicalize, capitalize, singularize };

// On the grocery list "3 units" and "2" of the same thing are one count.
function groceryUnit(unit) {
  const u = canonicalUnit(unit);
  return u === "unit" || u === "piece" ? "" : u;
}

// Canonical unit list for the manual-entry dropdown, derived from the same
// alias map that powers grocery-list merging — so a unit picked from this
// list is guaranteed to already be in its canonical form.
export const UNIT_OPTIONS = UNIT_GROUPS.flatMap((g) => g.units);

// The recipes an item is for, as the small line under it: "Tacos" or "Tacos,
// Chili"; with three or more, the first and how many more ("Tacos +2"). `all`
// is every one, for a tooltip. A hand-added item is for no recipe,
// so every part is empty.
export function recipesLine(usedIn) {
  const titles = [...new Set((usedIn || []).filter(Boolean))];
  const max = titles.length >= 3 ? 1 : 2;
  return { names: titles.slice(0, max).join(", "), more: Math.max(0, titles.length - max), all: titles.join(", ") };
}

// Combines every ingredient across the given planner entries into one deduplicated
// list, scaling quantities by whatever servings each planned meal was set to,
// and grouping similar ingredients (e.g. "avocado" + "California avocado")
// into a single line.
//
// One row per ingredient CORE, always — never split across rows just because
// two recipes measured it differently. Quantities that share a unit (or a
// convertible unit class, like tbsp/tsp) are summed into one number; when a
// recipe measures something in a way that genuinely can't be combined with
// what's already there (e.g. "¼ red onion" vs "¼ cup diced red onion" — a
// fraction of a whole onion isn't the same kind of quantity as a cup), it's
// kept as a separate "part" on the SAME row rather than spawning a duplicate
// line item. See `parts` on each returned item.
//
// extraItems are manually-typed additions (see GroceryExtraItem) — things
// like "paper towels" or extra onions beyond what a recipe calls for. Each
// stays its own row (never merged into a recipe-derived row's quantity, so
// adding/removing one never touches what a recipe contributes) but still
// gets a `core` so it can be dragged into store sections and filed
// alongside matching recipe ingredients the same way everything else is.
//
// plannerEntries is every planned meal from today onward, across all weeks:
// the same ingredient from several meals, in any week, is one row.
//
// overrides are GroceryItemOverride rows, matched by row key: a removed row
// comes back flagged `removed` (callers leave it off the list but can offer
// to restore it), `keep` says "put back on the list" was pressed for a row
// Inventory covers (lib/groceryAtHome.js), and `customQuantity` is the user's
// own amount, shown alongside what the recipes call for.
//
// Each recipe row also carries `ingredientNames`: the ingredients as the
// recipes write them, which is what lib/groceryAtHome.js asks the shared
// matcher about.
export function buildGroceryList(plannerEntries, extraItems = [], overrides = []) {
  const map = new Map(); // core -> { core, name, parts, usedIn, varieties, ingredientNames }

  for (const entry of plannerEntries) {
    // Reusing food, already having what's needed, or already cooked: nothing to buy.
    if (entry.isLeftover || entry.alreadyHave || entry.cookedAt) continue;
    const recipe = entry.recipe;
    if (!recipe) continue;
    const base = recipe.baseServings || 1;
    const scale = (entry.servings || base) / base;

    // Several foods written on one line ("salt and pepper, to taste") are a row each,
    // with no amount: the one rule the Inventory matcher reads them by.
    const ingredients = (recipe.ingredients || []).flatMap((ing) => {
      const foods = foodsOnLine(ing.name);
      return foods.length > 1 ? foods.map((name) => ({ ...ing, name, quantity: null, unit: null })) : [ing];
    });

    for (const ing of ingredients) {
      const unit = groceryUnit(ing.unit);
      const { core, varieties, written } = canonicalize(ing.name);
      const resolvedCore = core || ing.name.toLowerCase();
      const shownName = capitalize(getLang() === "fr" && written ? written : resolvedCore);
      const qty = ing.quantity != null ? ing.quantity * scale : null;

      if (!map.has(resolvedCore)) {
        map.set(resolvedCore, {
          core: resolvedCore,
          name: shownName,
          parts: [],
          usedIn: new Set(),
          varieties: new Set(),
          ingredientNames: new Set(),
        });
      }

      const existing = map.get(resolvedCore);
      existing.usedIn.add(recipe.title);
      existing.ingredientNames.add(ing.name);
      varieties.forEach((v) => existing.varieties.add(v));
      // Keep the shorter display name (fewer prep words attached)
      if (shownName.length < existing.name.length) existing.name = shownName;

      addQuantityPart(existing.parts, qty, unit || null);
    }
  }

  const recipeItems = [...map.values()].map((item) => {
    const parts = item.parts.length > 0 ? item.parts : [{ quantity: null, unit: null }];
    return {
      key: item.core,
      core: item.core,
      name: item.name,
      parts,
      // Legacy single-value fields — first part only. Fine for the common
      // case (one part); GroceryList.jsx reads `parts` directly to render
      // the rare multi-part row.
      quantity: parts[0].quantity,
      unit: parts[0].unit,
      usedIn: [...item.usedIn],
      varieties: [...item.varieties].map(capitalize),
      ingredientNames: [...item.ingredientNames],
    };
  });

  const manualItems = extraItems.map((extra) => {
    const { core, varieties } = canonicalize(extra.name);
    const resolvedCore = core || extra.name.toLowerCase();
    return {
      key: `extra-${extra.id}`,
      core: resolvedCore,
      name: extra.name,
      parts: [{ quantity: extra.quantity ?? null, unit: extra.unit || null }],
      quantity: extra.quantity ?? null,
      unit: extra.unit || null,
      usedIn: [],
      varieties: varieties.map(capitalize),
      ingredientNames: [],
      // Typed in by hand means you're buying it, whatever Inventory holds.
      isManual: true,
      manualId: extra.id,
      // The flyer deal it was added from, if it was: tapping the row opens it.
      dealId: extra.dealId || null,
    };
  });

  const overrideByKey = new Map(overrides.map((o) => [o.key, o]));
  return [...recipeItems, ...manualItems]
    .map((item) => {
      const o = overrideByKey.get(item.key);
      return { ...item, removed: !!o?.removed, keep: !!o?.keep, customQuantity: o?.quantity || null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Bigger units once an amount gets unwieldy (1500 g -> 1.5 kg).
function scaleUp(qty, unit) {
  if (qty == null) return { qty, unit };
  if (unit === "g" && qty >= 1000) return { qty: qty / 1000, unit: "kg" };
  if (unit === "ml" && qty >= 1000) return { qty: qty / 1000, unit: "l" };
  if (unit === "tsp" && qty >= 3 && Math.abs(qty / 3 - Math.round(qty / 3)) < 0.01) return { qty: qty / 3, unit: "tbsp" };
  return { qty, unit };
}

// A row's combined recipe amount, readable: "1.2 kg", "4 cloves",
// "2 + 1 cup" when two recipes measured it in ways that don't add up.
export function formatAmount(parts) {
  if (!parts || parts.length === 0) return "";
  return parts
    .filter((p) => p.quantity != null)
    .map((p) => {
      const { qty, unit } = scaleUp(p.quantity, p.unit);
      const amount = qty >= 10 ? formatNumber(Math.round(qty * 10) / 10, { useGrouping: false }) : formatQuantity(qty);
      return unit ? `${amount} ${unitLabel(unit, qty)}` : amount;
    })
    .join(" + ");
}

// Adds a (quantity, unit) pair into a row's part list — merging into an
// existing part when the units are identical or convertible within the same
// class (weight<->weight, volume<->volume), otherwise appending a new part
// so the amount still shows up on the same row instead of a duplicate row.
function addQuantityPart(parts, qty, unit) {
  for (const part of parts) {
    if (part.unit === unit) {
      part.quantity = part.quantity != null && qty != null ? part.quantity + qty : part.quantity ?? qty;
      return;
    }
    if (qty != null && part.quantity != null && part.unit && unit) {
      const converted = convertToUnit(qty, unit, part.unit);
      if (converted != null) {
        part.quantity += converted;
        return;
      }
    }
  }
  parts.push({ quantity: qty, unit: unit || null });
}

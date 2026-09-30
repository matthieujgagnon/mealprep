// Turns a saved recipe into the editor's working state and back again.
import { formatQuantity, parseQuantityInput } from "./units.js";
import { stepHeadingText, stepImage, stepIsHeading, stepText } from "./steps.js";

// A client-only id for drag-and-drop - stable across reorders, never sent
// to the server.
export function makeLocalId() {
  return crypto.randomUUID ? crypto.randomUUID() : `local-${Math.random().toString(36).slice(2)}`;
}

export const emptyIngredient = () => ({ _id: makeLocalId(), name: "", quantity: "", unit: "", notes: "" });
export const emptyIngredientSection = () => ({ _id: makeLocalId(), isSection: true, name: "" });
export const emptyStep = () => ({ _id: makeLocalId(), text: "", image: null });
export const emptyStepHeading = () => ({ _id: makeLocalId(), head: true, text: "" });

// Mirrors the server's stripStrayParens - some imported notes carry one
// unmatched paren left over from the source site's markup.
function stripStrayParens(text) {
  let result = text;
  const countOpen = () => (result.match(/\(/g) || []).length;
  const countClose = () => (result.match(/\)/g) || []).length;
  while (result.trimEnd().endsWith(")") && countClose() > countOpen()) {
    result = result.trimEnd().slice(0, -1).trimEnd();
  }
  while (result.trimStart().startsWith("(") && countOpen() > countClose()) {
    result = result.trimStart().slice(1).trimStart();
  }
  return result;
}

// "(melted)" -> "melted": people type the parens out of habit.
export function stripWrappingParens(text) {
  if (!text) return text;
  const trimmed = stripStrayParens(text.trim());
  const match = trimmed.match(/^\(([^()]+)\)$/);
  return match ? match[1].trim() : trimmed;
}

// Flat ingredients (each with its own `group`) -> rows with a section row
// before the first ingredient of each group.
export function ingredientsToRows(ingredients) {
  if (!ingredients || ingredients.length === 0) return [emptyIngredient()];
  const rows = [];
  let lastGroup; // undefined: distinct from a real "no group" (null)
  for (const ing of ingredients) {
    const group = ing.group || null;
    if (group && group !== lastGroup) rows.push({ _id: makeLocalId(), isSection: true, name: group });
    lastGroup = group;
    rows.push({
      _id: makeLocalId(),
      name: ing.name || "",
      quantity: ing.quantity != null ? formatQuantity(ing.quantity) : "",
      unit: ing.unit || "",
      notes: stripWrappingParens(ing.notes || ""),
    });
  }
  return rows;
}

// Rows -> the API's flat list; each ingredient's group is the section row
// above it. Rows without a name are dropped.
export function rowsToIngredients(rows) {
  let currentGroup = null;
  const result = [];
  for (const row of rows) {
    if (row.isSection) {
      currentGroup = row.name.trim() || null;
      continue;
    }
    if (!row.name.trim()) continue;
    result.push({
      name: row.name.trim(),
      quantity: parseQuantityInput(row.quantity),
      unit: (row.unit || "").trim() || null,
      notes: stripWrappingParens((row.notes || "").trim()) || null,
      group: currentGroup,
      position: result.length,
    });
  }
  return result;
}

// Saved steps are strings (or { text, image }); a short line ending in a
// colon is a section heading (see steps.js stepIsHeading).
export function instructionsToSteps(instructions) {
  const steps = (instructions || []).map((step) =>
    stepIsHeading(step)
      ? { _id: makeLocalId(), head: true, text: stepHeadingText(step) }
      : { _id: makeLocalId(), text: stepText(step), image: stepImage(step) }
  );
  return steps.length ? steps : [emptyStep()];
}

export function stepsToInstructions(steps) {
  const result = [];
  for (const step of steps) {
    const text = step.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (step.head) {
      result.push(`${text.replace(/:+$/, "")}:`);
      continue;
    }
    // A step that happens to read like a heading would come back as one.
    const safe = stepIsHeading(text) ? text.replace(/:+$/, ".") : text;
    result.push(step.image ? { text: safe, image: step.image } : safe);
  }
  return result;
}

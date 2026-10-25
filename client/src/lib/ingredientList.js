import TABLE from "./ingredientDisplay.txt?raw";
import { buildIndex, builtInRowsOf, effectiveRows, parseTable } from "./ingredientTable.js";

// The ingredient names table as the app holds it: the built-in file (ingredientDisplay.txt, parsed
// here once) with Matt's changes on top of it (the OVERRIDES: `setIngredientOverrides`; the file is
// never changed). This is the one list every reader takes: the display (ingredientDisplay.js),
// the Inventory matcher (inventoryMatch.js, through frenchReading.js) and the recipe search. It has
// no React and nothing that only the browser has, so the wide-check script reads it too.
//
// Whoever reads the rows follows `ingredientListVersion()`: it moves whenever the changes do, and
// `subscribeIngredientOverrides` calls a function when they change.

export const SECTIONS = parseTable(TABLE);

// The built-in rows, exactly as the file has them:
// { en: { one: [..], other: [..] }, fr: { one, other }, gender: "m" | "f", alwaysPlural: bool, key }
export const ingredientRows = builtInRowsOf(SECTIONS);

// The built-in file's own lookup. `conflicts`: two lines that claim the same written name in the
// same language (the test fails on any). `ambiguous`: a written form that is a different
// ingredient in each language (« raisin »), which is not read at all.
const builtIn = buildIndex(ingredientRows);
export const nounIndex = builtIn.nounIndex;
export const conflicts = builtIn.conflicts;
export const ambiguous = builtIn.ambiguous;

// The rows in use: the built-in rows with Matt's overrides applied. It is rebuilt whenever the
// overrides change (they arrive after the app has loaded, and change when he saves).
let overrides = [];
let live = { rows: ingredientRows, ...builtIn, ambiguousSet: new Set(builtIn.ambiguous) };
let version = 0;
const listeners = new Set();

// Replaces the whole list of overrides: [{ id, replaces, hidden, enOne, enOther, frOne, frOther,
// gender, updatedAt, updatedBy }], as the server sends it. Every screen that draws a name, and the
// matcher, follow.
export function setIngredientOverrides(next) {
  overrides = Array.isArray(next) ? next : [];
  const rows = effectiveRows(ingredientRows, overrides);
  const index = buildIndex(rows);
  live = { rows, ...index, ambiguousSet: new Set(index.ambiguous) };
  version++;
  for (const listener of [...listeners]) listener();
}

export const getIngredientOverrides = () => overrides;

// Moves whenever the overrides change.
export const ingredientOverridesVersion = () => version;
export const ingredientListVersion = ingredientOverridesVersion;

// Calls `listener` whenever the overrides change; gives back the function that stops it.
export const subscribeIngredientOverrides = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// The rows in use now (built-in with the overrides applied, Matt's first): what the Admin search,
// the matcher and the recipe search read.
export const effectiveIngredientRows = () => live.rows;

// The lookups for the rows in use: { rows, nounIndex, conflicts, ambiguous, ambiguousSet, properFirstWords }.
export const liveIngredientList = () => live;

// The table's describing words as their cells: English | French m | f | m plural | f plural | place.
export const describingCells = () => SECTIONS["describing words"].map(({ cells }) => cells);

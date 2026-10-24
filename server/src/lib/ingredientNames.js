import fs from "fs";
import { builtInRowsOf, cleanOverride, clashOf, OVERRIDES_MAX, parseTable } from "../../../client/src/lib/ingredientTable.js";

// Matt's changes to the ingredient names table (routes/adminIngredientNames.js). The server only
// keeps them and checks them; which name is shown where is decided on the client
// (lib/ingredientDisplay.js).
//
// The built-in table is the plain text file client/src/lib/ingredientDisplay.txt, in the same
// repo (the whole repo is deployed). It is read ONCE, when the server starts, with the same
// parser and rules the browser runs (client/src/lib/ingredientTable.js: there is no second copy
// of either), so a change can be refused when it uses a spelling the built-in table already has.
// The matcher and search (the next task) read the same list through `builtInIngredientRows`.

const TABLE_FILE = new URL("../../../client/src/lib/ingredientDisplay.txt", import.meta.url);

// The built-in rows of a table file; null (and a line in the log) when it can't be read.
export function loadBuiltInRows(file = TABLE_FILE, log = console.error) {
  try {
    return builtInRowsOf(parseTable(fs.readFileSync(file, "utf8")));
  } catch (err) {
    log(`Couldn't read the ingredient names table (${err.message}). Changes to ingredient names are refused until the server restarts with it.`);
    return null;
  }
}

const BUILT_IN = loadBuiltInRows();

// The built-in rows ({ en, fr, gender, alwaysPlural, key } each), or null when the file couldn't be read.
export const builtInIngredientRows = () => BUILT_IN;

// What an override looks like in an answer: every account gets the names; only an admin also
// gets who saved it last (their email).
export const OVERRIDE_SELECT = {
  id: true,
  replaces: true,
  hidden: true,
  enOne: true,
  enOther: true,
  frOne: true,
  frOther: true,
  gender: true,
  updatedAt: true,
};

export function overrideRow(row, { admin = false } = {}) {
  const out = Object.fromEntries(Object.keys(OVERRIDE_SELECT).map((key) => [key, row[key]]));
  if (admin) out.updatedBy = row.updatedBy?.email ?? null;
  return out;
}

// What the app sent for a save, checked against everything it must agree with.
//   body      { replaces?, hidden?, enOne, enOther, frOne, frOther, gender }
//   all       every override now in the table
//   self      the override being changed, or null for a new one (a POST for a built-in row that
//             already has an override changes that one, so the route passes it as `self`)
// { data } to save, or { error, vars, status } (a message key of lib/i18n.js).
//   - the same checks the form makes (cleanOverride);
//   - a new override for a built-in row needs the file to have that row;
//   - none of its spellings may be one that another row already has in the same language,
//     built-in or Matt's own (the row it replaces doesn't count);
//   - at most OVERRIDES_MAX of them.
export function checkOverride(body, all, self = null, builtIn = BUILT_IN) {
  if (!builtIn) return { error: "ingredientTableMissing", status: 503 };
  const input = body && typeof body === "object" ? body : {};
  // A saved override keeps the built-in row it stands in for.
  const cleaned = cleanOverride(self ? { ...input, replaces: self.replaces } : input);
  if (cleaned.error) return cleaned;
  const data = cleaned.data;
  if (!self && all.length >= OVERRIDES_MAX) return { error: "ingredientLimit", vars: { max: OVERRIDES_MAX }, status: 400 };
  if (!self && data.replaces && !builtIn.some((row) => row.key === data.replaces)) return { error: "notFound.ingredientBuiltIn", status: 404 };
  const clash = clashOf(data, builtIn, all, self);
  if (clash) return { ...clash, status: 400 };
  return { data };
}

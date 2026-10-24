// The ingredient names table as data, and the rules for Matt's changes to it. Plain
// JavaScript with no imports, so the browser (lib/ingredientDisplay.js) and the server
// (server/src/lib/ingredientNames.js, which reads ingredientDisplay.txt once at start-up)
// run this one file: there is no second parser and no second copy of the rules.
//
// A built-in row comes from a line of ingredientDisplay.txt. An OVERRIDE is Matt's own
// row from the Admin page (the IngredientNameOverride table): it adds an ingredient, or
// replaces a built-in row (`replaces` is that row's key), or hides it (`hidden`). The
// built-in file is never changed. `effectiveRows` is the one list every reader uses.

export const fold = (text) =>
  String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/gi, "oe")
    .toLowerCase();

// "Gousses d'ail" and "gousses d’ail" and "Gousses d ail" read the same.
export const keyOf = (text) =>
  fold(text)
    .replace(/['’]/g, " ")
    .replace(/[-‐]/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const forms = (cell) => String(cell || "").split("/").map((s) => s.trim()).filter(Boolean);

// ---- Reading the table ------------------------------------------------------------

export function parseTable(text) {
  const sections = { ingredients: [], "describing words": [], "prep words": [], "prep adverbs": [], "prep phrases": [] };
  let section = null;
  for (const raw of String(text).split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const head = line.match(/^\[(.+)\]$/);
    if (head) {
      section = head[1];
      continue;
    }
    if (!sections[section]) throw new Error(`ingredientDisplay.txt: a line before any [section]: ${line}`);
    sections[section].push({ line, cells: line.split("|").map((c) => c.trim()) });
  }
  return sections;
}

// m, f, and mp / fp when the French name is always plural (« épinards », « pâtes »).
export const GENDERS = ["m", "f", "mp", "fp"];

// { line, en: { one, other }, fr: { one, other }, gender: "m" | "f" | null, alwaysPlural, key }
// from the five cells of a line. `key` names the row for an override to replace: its first
// English singular, which no two lines share.
export function rowFromCells(cells, line = cells.join(" | ")) {
  const [en1, enN, fr1, frN, g] = cells;
  const plural = (cell, one) => (cell === "=" ? one : forms(cell));
  const gender = /^([mf])(p?)$/.exec(g || "");
  return {
    line,
    en: { one: forms(en1), other: plural(enN, forms(en1)) },
    fr: { one: forms(fr1), other: plural(frN, forms(fr1)) },
    gender: gender ? gender[1] : null,
    alwaysPlural: Boolean(gender && gender[2]),
    key: keyOf(forms(en1)[0] || ""),
  };
}

// The built-in rows of a parsed table.
export const builtInRowsOf = (sections) => sections.ingredients.map(({ line, cells }) => rowFromCells(cells, line));

// ---- Matt's overrides -------------------------------------------------------------

export const NAME_MAX = 60; // one spelling
export const CELL_MAX = 200; // one side of a row, spellings and slashes together
export const FORMS_MAX = 8; // spellings in one side
export const OVERRIDES_MAX = 1000;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;
const label = (value) => String(value ?? "").replace(CONTROL, " ").replace(/\s+/g, " ").trim();

// One side of a row as it is kept: its spellings joined by "/", the same way the file writes
// them. A blank plural is "=" (the same as the singular). { cell } or { error, vars }.
function cleanCell(value, isPlural) {
  const text = label(value);
  if (text === "=" && isPlural) return { cell: "=" };
  if (!text) return { cell: isPlural ? "=" : "" };
  if (text.includes("|")) return { error: "ingredientChars" };
  const seen = new Set();
  const parts = [];
  for (const part of text.split("/").map(label).filter(Boolean)) {
    const key = keyOf(part);
    if (!key) return { error: "ingredientEmpty" };
    if (part.length > NAME_MAX) return { error: "ingredientTooLong", vars: { max: NAME_MAX } };
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(part);
  }
  if (parts.length > FORMS_MAX) return { error: "ingredientTooMany", vars: { max: FORMS_MAX } };
  const cell = parts.join("/");
  if (cell.length > CELL_MAX) return { error: "ingredientTooLong", vars: { max: NAME_MAX } };
  return { cell };
}

// The four sides of a row, each tidied, with nothing required: { cells: { enOne, enOther, frOne,
// frOther } } or { error, vars }. The form uses it to say a name is taken before the rest is typed.
export function cleanCells(body) {
  const input = body && typeof body === "object" ? body : {};
  const cells = {};
  for (const [name, isPlural] of [["enOne", false], ["enOther", true], ["frOne", false], ["frOther", true]]) {
    const result = cleanCell(input[name], isPlural);
    if (result.error) return result;
    cells[name] = result.cell;
  }
  return { cells };
}

// What the form (or a request) sent, checked and tidied. { data } or { error, vars }, the
// error being a message key (the server's lib/i18n.js and the app's admin.names.error.* both
// have it). `data` is { replaces, hidden, enOne, enOther, frOne, frOther, gender }.
//   - hidden: the built-in row `replaces` is switched off; it carries no names.
//   - otherwise English and French each need a singular, and a gender is needed.
export function cleanOverride(body) {
  const input = body && typeof body === "object" ? body : {};
  const asked = label(input.replaces);
  const replaces = asked ? keyOf(asked) : null;
  if (asked && (!replaces || replaces.length > 120)) return { error: "ingredientEmpty" };

  if (input.hidden === true) {
    if (!replaces) return { error: "ingredientHideNeedsBuiltIn" };
    return { data: { replaces, hidden: true, enOne: "", enOther: "", frOne: "", frOther: "", gender: "" } };
  }

  const sides = cleanCells(input);
  if (sides.error) return sides;
  const cells = sides.cells;
  if (!cells.enOne || !cells.frOne) return { error: "ingredientEmpty" };
  const gender = label(input.gender).toLowerCase();
  if (!GENDERS.includes(gender)) return { error: "ingredientGender" };
  return { data: { replaces, hidden: false, ...cells, gender } };
}

// A row (the same shape as a built-in one) from an override that adds or replaces.
export function rowFromOverride(override) {
  const { enOne, enOther, frOne, frOther, gender } = override;
  const row = rowFromCells([enOne, enOther, frOne, frOther, gender], [enOne, enOther, frOne, frOther, gender].join(" | "));
  row.override = override;
  row.key = override.replaces || null;
  return row;
}

// The one list every reader uses: Matt's rows first (so that where a spelling is on two rows,
// his is the one that is read), then the built-in rows that no override replaces or hides.
// An override that names a built-in row the file no longer has simply adds its names.
export function effectiveRows(builtIn, overrides) {
  const list = overrides || [];
  const replaced = new Set(list.filter((o) => o.replaces).map((o) => o.replaces));
  return [...list.filter((o) => !o.hidden).map(rowFromOverride), ...builtIn.filter((row) => !replaced.has(row.key))];
}

// The first spelling of `row` (in either language) that another row already uses in the same
// language: { form, lang, other } with `other` the row that has it, or null. Accents, capitals,
// apostrophes and hyphens do not count ("Jalapeno" is "jalapeño"). A spelling that is a different
// food in the other language (« raisin ») is allowed: only the same language clashes.
export function takenSpelling(row, otherRows) {
  for (const lang of ["en", "fr"]) {
    const used = new Map();
    for (const other of otherRows) {
      for (const number of ["one", "other"]) for (const form of other[lang][number]) if (!used.has(keyOf(form))) used.set(keyOf(form), other);
    }
    for (const number of ["one", "other"]) {
      for (const form of row[lang][number]) {
        const other = used.get(keyOf(form));
        if (other) return { form, lang, other };
      }
    }
  }
  return null;
}

// The clash a change would make, or null: { error: "ingredientTaken", vars: { form, other } }.
//   data       the cleaned change (cleanOverride's `data`)
//   builtIn    the built-in rows
//   overrides  every change now kept
//   self       the change being changed (it does not clash with its own old names), or null
// The built-in row the change replaces does not count either: it is what the change stands in for.
// A hidden change takes no names, so it can't clash.
export function clashOf(data, builtIn, overrides, self = null) {
  if (data.hidden) return null;
  const others = effectiveRows(builtIn, (overrides || []).filter((other) => other.id !== self?.id)).filter(
    (row) => row.override || row.key !== data.replaces
  );
  const taken = takenSpelling(rowFromOverride(data), others);
  return taken ? { error: "ingredientTaken", vars: { form: taken.form, other: taken.other.en.one[0] } } : null;
}

// ---- Looking names up -------------------------------------------------------------

// Every way a name can be written -> who it is: key -> [{ row, lang, number }], with the clashes
// (two rows claiming the same spelling in one language, the first row wins) and the spellings
// that are a different ingredient in each language (« raisin » is a grape in French, English
// "raisin" is dried: it is not read at all, so it is shown as written).
export function buildIndex(rows) {
  const nounIndex = new Map();
  const conflicts = [];
  for (const row of rows) {
    for (const lang of ["en", "fr"]) {
      for (const number of ["one", "other"]) {
        for (const form of row[lang][number]) {
          const key = keyOf(form);
          const list = nounIndex.get(key) || [];
          const same = list.find((entry) => entry.lang === lang);
          if (same && same.row !== row) conflicts.push(`"${form}" is on two lines: ${same.row.line} / ${row.line}`);
          // The first number a written form has is the one it keeps ("pois" is one before it is other).
          else if (!same) list.push({ row, lang, number });
          nounIndex.set(key, list);
        }
      }
    }
  }
  const ambiguous = [];
  for (const [key, list] of nounIndex) if (new Set(list.map((entry) => entry.row)).size > 1) ambiguous.push(key);

  // First words that start with a capital in the table because they are a name: Roma,
  // Dijon, Worcestershire. A capital on one of them is not a sentence's capital.
  const properFirstWords = new Set();
  for (const row of rows) {
    for (const lang of ["en", "fr"]) {
      for (const number of ["one", "other"]) {
        for (const form of row[lang][number]) if (/^\p{Lu}/u.test(form)) properFirstWords.add(keyOf(form.split(" ")[0]));
      }
    }
  }
  return { nounIndex, conflicts, ambiguous, properFirstWords };
}

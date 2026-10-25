import { looksFrench } from "./bilingual.js";
import { buildIndex, clashOf, cleanCells, cleanOverride, effectiveRows, fold, keyOf, rowFromOverride } from "./ingredientTable.js";
import { ingredientRows } from "./ingredientDisplay.js";
import { foodProfileUnder, readingFor, sameProfiles } from "./inventoryMatch.js";
import { NOT_READ_FR } from "./matcherWords.js";

// What the Admin page's Ingredient names card needs to fill in a name: good first guesses for
// the form (components/IngredientNameForm.jsx), the list of every row with where it stands, the
// search over them, and the check on what was typed. The rules for what is allowed are
// lib/ingredientTable.js, which the server runs too. All guesses are only a start: the form
// shows them and Matt changes whatever is wrong.

// ---- Guesses -----------------------------------------------------------------------

// The plural of a singular, in "en" or "fr".
export function guessPlural(word, lang) {
  const w = String(word || "").trim();
  if (!w) return "";
  if (lang === "fr") {
    if (/[sxz]$/i.test(w)) return w;
    if (/chou$/i.test(w)) return `${w}x`;
    if (/(eau|eu|au)$/i.test(w)) return `${w}x`;
    if (/al$/i.test(w)) return `${w.slice(0, -2)}aux`;
    return `${w}s`;
  }
  if (/(lea|loa)f$/i.test(w)) return `${w.slice(0, -1)}ves`;
  if (/[^aeiou]y$/i.test(w)) return `${w.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(w)) return `${w}es`;
  if (/(tomato|potato)$/i.test(w)) return `${w}es`;
  return `${w}s`;
}

// The singular of a plural, as best it can be told.
export function guessSingular(word, lang) {
  const w = String(word || "").trim();
  if (!w) return "";
  if (lang === "fr") {
    if (/eaux$/i.test(w)) return w.slice(0, -1);
    if (/aux$/i.test(w)) return `${w.slice(0, -3)}al`;
    if (/choux$/i.test(w)) return w.slice(0, -1);
    return /s$/i.test(w) ? w.slice(0, -1) : w;
  }
  if (/(lea|loa)ves$/i.test(w)) return `${w.slice(0, -3)}f`;
  if (/[^aeiou]ies$/i.test(w)) return `${w.slice(0, -3)}y`;
  if (/(sses|ches|shes|xes|oes)$/i.test(w)) return w.slice(0, -2);
  return /s$/i.test(w) ? w.slice(0, -1) : w;
}

// Whether a name as the recipe wrote it already looks like a plural: dropping its ending and
// putting it back gives the same word, and it is not a word that ends in s in the singular too.
export function looksPlural(word, lang) {
  const w = String(word || "").trim();
  if (w.length < 4) return false;
  if (lang === "fr" ? /(is|us|ois|ais|ous|ss)$/i.test(w) : /(ss|us|is)$/i.test(w)) return false;
  const one = guessSingular(w, lang);
  return one !== w && guessPlural(one, lang).toLowerCase() === w.toLowerCase();
}

// The gender a French name most likely has: "f" or "m". It goes by the first word, which is the
// noun (« pâte de piment fort », « gousse d'ail »). Only a first guess.
export function guessGender(french) {
  const raw = String(french || "").split("/")[0].trim().split(/\s+/)[0].toLowerCase();
  const w = fold(raw);
  if (!w) return "";
  if (/(tion|sion)$/.test(w) || raw.endsWith("ée")) return "f";
  if (raw.endsWith("e")) return /(age|isme|ment|bre|cre|dre|gre|pre|rre|tre|vre|fre)$/.test(w) ? "m" : "f";
  return "m";
}

// ---- The form's starting values ----------------------------------------------------

// A draft is what the form edits: the four sides as text ("a/b" for other spellings, a blank
// plural meaning the same as the singular), a gender "m" | "f" and `plural` (always plural).
const blank = () => ({ enOne: "", enOther: "", frOne: "", frOther: "", gender: "", always: false });

const lowerFirst = (text) => (/^\p{Lu}\p{Ll}/u.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text);

// For a name from a recipe that has no translation: the name as written goes on its own
// language's side, with its plural guessed (or its singular, when it was written as a plural).
export function draftForGap(name) {
  const written = lowerFirst(String(name || "").trim());
  const lang = looksFrench(written) ? "fr" : "en";
  const plural = looksPlural(written, lang);
  const one = plural ? guessSingular(written, lang) : written;
  const other = plural ? written : guessPlural(written, lang);
  const draft = blank();
  draft[`${lang}One`] = one;
  draft[`${lang}Other`] = other === one ? "" : other;
  if (lang === "fr") draft.gender = guessGender(one);
  return draft;
}

const cell = (forms) => forms.join("/");

// For a row of the table (a built-in one, or Matt's): its names as they are now.
export function draftForRow(row) {
  const side = (lang) => ({
    [`${lang}One`]: cell(row[lang].one),
    [`${lang}Other`]: cell(row[lang].other) === cell(row[lang].one) ? "" : cell(row[lang].other),
  });
  return { ...side("en"), ...side("fr"), gender: row.gender || "", always: Boolean(row.alwaysPlural) };
}

// What cleanOverride and the server are given: the draft's gender and "always plural" as one
// code ("m", "f", "mp", "fp"), and the built-in row it stands in for.
export function bodyOf(draft, replaces = null) {
  return {
    replaces,
    hidden: false,
    enOne: draft.enOne,
    enOther: draft.enOther,
    frOne: draft.frOne,
    frOther: draft.frOther,
    gender: draft.gender ? `${draft.gender}${draft.always ? "p" : ""}` : "",
  };
}

// The first thing wrong with a draft, or null: { error, vars } (error is a message key, the
// app's admin.names.error.<key>). `overrides` is every change now kept; `self` is the one being
// changed (or null), so its own names do not clash with themselves. `live` says the problem
// can be shown while typing (a clash or a length); the others wait until Save is pressed.
export function problemWith(draft, { replaces = null, overrides = [], self = null, builtIn = ingredientRows } = {}) {
  const body = bodyOf(draft, replaces);
  // What is typed so far is checked first (a length, a |, a name another row has), whichever
  // sides are still empty, so a clash is said as soon as it is typed.
  const sides = cleanCells(body);
  if (sides.error) return { error: sides.error, vars: sides.vars, live: true };
  const clash = clashOf({ replaces: body.replaces, hidden: false, ...sides.cells, gender: body.gender }, builtIn, overrides, self);
  if (clash) return { ...clash, live: true };
  const cleaned = cleanOverride(body);
  return cleaned.error ? { error: cleaned.error, vars: cleaned.vars, live: false } : null;
}

// ---- What the Inventory matcher makes of a draft -------------------------------------

// The matcher (« J'en ai ») learns its French from this table, so a row changes which Inventory
// items count for which recipes. The form shows these notes while Matt types; none of them stops a
// save (the only name that is refused is one of the matcher's own words, `clashOf`). Each note is
// { kind, ... } and has a message, admin.names.warn.<kind>:
//   reads      { form, was, now }  a French spelling the matcher already reads as one food, that this
//                                  row would make another ("citron" read as lemon, now as lime)
//   different  { english, french } the matcher would not take the row's two names for one food
//   notRead    { form }            a spelling the matcher never reads: it is also an English word
//                                  (« sale »), or a different ingredient in each language (« raisin »)
// `overrides`, `self` and `replaces` are as for `problemWith`; the draft's own row (and the built-in
// row it stands in for) is left out of "what the matcher knows now".
export function matcherNotes(draft, { replaces = null, overrides = [], self = null, builtIn = ingredientRows } = {}) {
  const sides = cleanCells(bodyOf(draft, replaces));
  if (sides.error || !sides.cells.enOne || !sides.cells.frOne) return [];
  const row = rowFromOverride({ replaces, hidden: false, ...sides.cells, enOther: sides.cells.enOther || "=", frOther: sides.cells.frOther || "=", gender: "m" });
  const kept = effectiveRows(builtIn, (overrides || []).filter((other) => other.id !== self?.id)).filter((r) => r.override || r.key !== replaces);
  const before = readingFor(kept);
  const after = readingFor([row, ...kept]);
  // The whole spelling is something the matcher already reads: a word or a phrase of the table or
  // of its own (not just a name with one known word in it).
  const knownWhole = (key) => before.words.has(key) || (key.includes(" ") && before.phraseMap.has(key.replace(/ /g, "")));
  const ambiguous = new Set(buildIndex([row, ...kept]).ambiguous);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const shape = (p) => [p.food, p.derived, p.part, [...p.cuts].sort(), [...p.kinds].sort()];
  const notes = [];
  for (const form of [...row.fr.one, ...row.fr.other]) {
    const key = keyOf(form);
    if (NOT_READ_FR.includes(key) || ambiguous.has(key)) {
      notes.push({ kind: "notRead", form });
      continue;
    }
    // Only a spelling the matcher already reads as a whole.
    if (!knownWhole(key)) continue;
    const was = foodProfileUnder(before, form);
    const now = foodProfileUnder(after, form);
    if (!same(shape(was), shape(now))) notes.push({ kind: "reads", form, was: was.food || was.core, now: now.food || now.core });
  }
  const english = foodProfileUnder(after, row.en.one[0]);
  const french = foodProfileUnder(after, row.fr.one[0]);
  if (!sameProfiles(english, french)) notes.push({ kind: "different", english: row.en.one[0], french: row.fr.one[0] });
  return notes;
}

// ---- Every row, and where it stands --------------------------------------------------

// Every row of the table with where it stands, for the card's search and "Your changes":
//   { ref, status: "built-in" | "changed" | "hidden" | "added", row, built, override }
// `row` is what is read now (a hidden row shows the built-in names it hides), `built` the built-in
// row it stands in for (null for an added ingredient) and `override` Matt's change (or null).
export function cardRows(builtIn, overrides) {
  const list = overrides || [];
  const byKey = new Map(list.filter((o) => o.replaces).map((o) => [o.replaces, o]));
  const out = [];
  for (const built of builtIn) {
    const override = byKey.get(built.key) || null;
    const ref = `built:${built.key}`;
    if (!override) out.push({ ref, status: "built-in", row: built, built, override });
    else if (override.hidden) out.push({ ref, status: "hidden", row: built, built, override });
    else out.push({ ref, status: "changed", row: rowFromOverride(override), built, override });
  }
  const keys = new Set(builtIn.map((row) => row.key));
  for (const override of list) {
    if (override.hidden || (override.replaces && keys.has(override.replaces))) continue;
    out.push({ ref: override.ref || `added:${override.id}`, status: "added", row: rowFromOverride(override), built: null, override });
  }
  return out;
}

// The rows a search finds: every spelling in either language, accents and capitals ignored,
// those whose name starts with it first. Nothing for a blank search.
export function searchCards(cards, query, limit = 30) {
  const wanted = keyOf(query);
  if (!wanted) return [];
  const spellings = (card) =>
    ["en", "fr"].flatMap((lang) => ["one", "other"].flatMap((number) => card.row[lang][number])).map((form) => keyOf(form));
  const hits = [];
  for (const card of cards) {
    const forms = spellings(card);
    if (!forms.some((form) => form.includes(wanted))) continue;
    const shown = [card.row.en.one[0], card.row.fr.one[0]].map((form) => keyOf(form));
    hits.push({ card, rank: shown.some((form) => form.startsWith(wanted)) ? 0 : forms.some((form) => form.startsWith(wanted)) ? 1 : 2 });
  }
  hits.sort((a, b) => a.rank - b.rank || a.card.row.en.one[0].localeCompare(b.card.row.en.one[0]));
  return hits.slice(0, limit).map((hit) => hit.card);
}

// Matt's changes, newest first.
export const changedCards = (cards) =>
  cards
    .filter((card) => card.override)
    .sort((a, b) => String(b.override.updatedAt || "").localeCompare(String(a.override.updatedAt || "")) || a.row.en.one[0].localeCompare(b.row.en.one[0]));

// "garlic clove" or "gousse d'ail": the row's first spelling in the language shown.
export const rowName = (row, lang) => row[lang === "fr" ? "fr" : "en"].one[0] || row.en.one[0] || row.fr.one[0] || "";

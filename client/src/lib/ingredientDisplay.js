import { useMemo } from "react";
import { getLang, useLang } from "../i18n/index.js";
import TABLE from "./ingredientDisplay.txt?raw";

// What a recipe's ingredient is called in the language the person picked.
//
// DISPLAY ONLY. The recipe keeps the words it was saved with; this changes only the text
// drawn on a screen (`ingredientName`, `ingredientNote`, or `useIngredientNames()` in a
// component). Everything that decides something (the Inventory matcher, sale lookups,
// "add to list", what is saved) keeps using the name as written.
//
// The names are in ingredientDisplay.txt, one line each, so they are easy to read and
// correct. A name (or note) that is not there is shown exactly as written, never half
// translated: it is listed for the admin instead (lib/ingredientGaps.js, shown by components/Admin.jsx).
//
//   - A name is read in whichever language it is written in: « Oignons rouges » and
//     "red onions" are the same ingredient. A name already in the language asked for is
//     returned as it was.
//   - It is read as a whole name first, then as a name with describing words around it
//     ("fresh", "boneless", « surgelés »), which agree with the name when shown in French.
//   - The number follows the written form: "onions" is shown « oignons ».
//   - "salt and pepper", "butter or margarine" are read part by part.
//   - A note ("finely chopped", « fondu ») is translated only when every word of it is
//     known, and agrees with the ingredient it belongs to.
//
// The matcher (inventoryMatch.js) is not touched and does not read this file;
// ingredientDisplay.test.js fails when a line here is not the same food to the matcher.

const fold = (text) =>
  String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/gi, "oe")
    .toLowerCase();

// "Gousses d'ail" and "gousses d’ail" and "Gousses d ail" read the same.
const keyOf = (text) =>
  fold(text)
    .replace(/['’]/g, " ")
    .replace(/[-‐]/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const forms = (cell) => String(cell || "").split("/").map((s) => s.trim()).filter(Boolean);

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

const SECTIONS = parseTable(TABLE);

// { en: { one: [..], other: [..] }, fr: { one, other }, gender: "m" | "f", plural: bool }
export const ingredientRows = SECTIONS.ingredients.map(({ line, cells }) => {
  const [en1, enN, fr1, frN, g] = cells;
  const plural = (cell, one) => (cell === "=" ? one : forms(cell));
  const gender = /^([mf])(p?)$/.exec(g || "");
  const row = {
    line,
    en: { one: forms(en1), other: plural(enN, forms(en1)) },
    fr: { one: forms(fr1), other: plural(frN, forms(fr1)) },
    gender: gender ? gender[1] : null,
    alwaysPlural: Boolean(gender && gender[2]),
  };
  return row;
});

// Every way a name can be written -> who it is: key -> [{ row, lang, number }].
export const nounIndex = new Map();
// Two lines that claim the same written name in the same language (the test fails on any).
export const conflicts = [];
// A written form that is a different ingredient in each language (« raisin » is a grape in
// French, English "raisin" is dried): it is not read at all, so it is shown as written.
export const ambiguous = [];
for (const row of ingredientRows) {
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
for (const [key, list] of nounIndex) if (new Set(list.map((entry) => entry.row)).size > 1) ambiguous.push(key);

// Describing words: key -> { word, lang, index (0 m, 1 f, 2 m pl, 3 f pl) }.
export const describing = SECTIONS["describing words"].map(({ cells }) => {
  const [en, ...rest] = cells;
  const place = rest[4];
  return { en, fr: rest.slice(0, 4), place };
});
const describingIndex = new Map();
let describingLongest = 1;
describing.forEach((word, order) => {
  word.order = order;
  describingIndex.set(keyOf(word.en), { word, lang: "en" });
  word.fr.forEach((form) => {
    const key = keyOf(form);
    if (!describingIndex.has(key)) describingIndex.set(key, { word, lang: "fr" });
  });
});
for (const key of describingIndex.keys()) describingLongest = Math.max(describingLongest, key.split(" ").length);

// Prep words, adverbs and fixed phrases share one index: key -> { kind, item, lang }.
export const prepWords = SECTIONS["prep words"].map(({ cells }) => ({ en: cells[0], fr: cells.slice(1, 5) }));
export const prepAdverbs = SECTIONS["prep adverbs"].map(({ cells }) => ({ en: cells[0], fr: cells[1] }));
export const prepPhrases = SECTIONS["prep phrases"].map(({ cells }) => ({ en: cells[0], fr: cells[1] }));
const prepIndex = new Map();
let prepLongest = 1;
const addPrep = (form, entry) => {
  const key = keyOf(form);
  if (!prepIndex.has(key)) prepIndex.set(key, entry);
  prepLongest = Math.max(prepLongest, key.split(" ").length);
};
for (const item of prepWords) {
  addPrep(item.en, { kind: "part", item, lang: "en" });
  item.fr.forEach((form) => addPrep(form, { kind: "part", item, lang: "fr" }));
}
for (const item of prepAdverbs) {
  addPrep(item.en, { kind: "adv", item, lang: "en" });
  addPrep(item.fr, { kind: "adv", item, lang: "fr" });
}
for (const item of prepPhrases) {
  addPrep(item.en, { kind: "fixed", item, lang: "en" });
  addPrep(item.fr, { kind: "fixed", item, lang: "fr" });
}

// ---- Reading a name ---------------------------------------------------------------

const isBefore = (word) => word.place === "before";
const isColour = (word) => word.place === "colour";

// Describing words around a name. null when any word around it is not one.
function readDescribing(words) {
  const found = [];
  let i = 0;
  while (i < words.length) {
    let hit = null;
    for (let len = Math.min(describingLongest, words.length - i); len >= 1 && !hit; len--) {
      hit = describingIndex.get(words.slice(i, i + len).join(" "));
      if (hit) i += len;
    }
    if (!hit) return null;
    found.push(hit);
  }
  return found;
}

// The language(s) a reading can be in: a name both languages write the same ("tofu")
// can be either; describing words in one language settle it.
function languagesOf(nounLangs, mods) {
  let langs = new Set(nounLangs);
  for (const { lang } of mods) langs = new Set([...langs].filter((l) => l === lang));
  return langs;
}

// "oignons rouges" -> { row, number, mods, langs }; null when it is not a known name.
function readNoun(text) {
  const words = keyOf(text).split(" ").filter(Boolean);
  if (words.length === 0) return null;
  for (let len = words.length; len >= 1; len--) {
    for (let start = 0; start + len <= words.length; start++) {
      const key = words.slice(start, start + len).join(" ");
      const candidates = nounIndex.get(key);
      if (!candidates || ambiguous.includes(key)) continue;
      const before = readDescribing(words.slice(0, start));
      const after = readDescribing(words.slice(start + len));
      if (!before || !after) continue;
      const found = [...before, ...after];
      const langs = languagesOf(candidates.map((c) => c.lang), found);
      if (langs.size === 0) continue;
      const lang = [...langs][0];
      const spelled = candidates.find((c) => c.lang === lang);
      return { type: "noun", row: spelled.row, number: spelled.number, mods: found, langs };
    }
  }
  return null;
}

const CONJUNCTION = /\s+(?:and|or|et|ou)\s+/i;

// A whole name as written: a noun, a list of nouns ("salt and pepper"), or either with
// a note after a comma or in brackets. null when any part is not known.
function readName(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const bracket = raw.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (bracket && bracket[1]) {
    const head = readName(bracket[1]);
    return head ? { type: "noted", head, note: bracket[2], style: "bracket" } : null;
  }
  const comma = raw.indexOf(",");
  if (comma > 0) {
    const head = readName(raw.slice(0, comma));
    return head ? { type: "noted", head, note: raw.slice(comma + 1).trim(), style: "comma" } : null;
  }
  const noun = readNoun(raw);
  if (noun) return noun;
  const pieces = raw.split(CONJUNCTION);
  if (pieces.length < 2) return null;
  const joiners = [...raw.matchAll(new RegExp(CONJUNCTION, "gi"))].map((m) => m[0].trim().toLowerCase());
  const parts = pieces.map(readNoun);
  if (parts.some((p) => !p)) return null;
  let langs = new Set(["en", "fr"]);
  for (const p of parts) langs = new Set([...langs].filter((l) => p.langs.has(l)));
  if (langs.size === 0) return null;
  return { type: "list", parts, joiners, langs };
}

const langsOf = (reading) => (reading.type === "noted" ? langsOf(reading.head) : reading.langs);
const headNoun = (reading) => (reading.type === "noted" ? headNoun(reading.head) : reading.type === "list" ? reading.parts[0] : reading);

// ---- Showing it -------------------------------------------------------------------

// Which of a French word's four forms agrees with this name: 0 m, 1 f, 2 m plural, 3 f plural.
function agreement(row, number, listed) {
  const plural = row.alwaysPlural || number === "other" || listed > 1;
  return (row.gender === "f" ? 1 : 0) + (plural ? 2 : 0);
}

function showNoun(noun, target) {
  const { row, number, mods } = noun;
  const base = row[target][number][0];
  if (mods.length === 0) return base;
  const word = (hit) => (target === "fr" ? hit.word.fr[agreement(row, number)] : hit.word.en);
  const byOrder = (a, b) => a.word.order - b.word.order;
  const before = mods.filter((m) => isBefore(m.word)).sort(byOrder).map(word);
  const colour = mods.filter((m) => isColour(m.word)).sort(byOrder).map(word);
  const rest = mods.filter((m) => !isBefore(m.word) && !isColour(m.word)).sort(byOrder).map(word);
  const pieces = target === "fr" ? [...before, base, ...colour, ...rest] : [...before, ...rest, ...colour, base];
  return pieces.join(" ");
}

// "finely chopped" <-> « haché finement », every word of the note known or null.
function showNote(note, target, row, number, listed) {
  const text = String(note || "").trim();
  if (!text) return text;
  const split = text.split(/([\s,;]+)/);
  const words = [];
  const seps = [];
  for (let i = 0; i < split.length; i += 2) {
    words.push(split[i]);
    seps.push(split[i + 1] || "");
  }
  const keys = words.map(keyOf);
  const tokens = [];
  let at = 0;
  while (at < words.length) {
    if (!keys[at]) {
      at++;
      continue;
    }
    let used = 0;
    for (let len = Math.min(prepLongest, words.length - at); len >= 1 && !used; len--) {
      const window = keys.slice(at, at + len);
      const hit = window.every(Boolean) ? prepIndex.get(window.join(" ")) : null;
      if (hit) {
        tokens.push({ ...hit, sep: seps[at + len - 1] });
        used = len;
      }
    }
    if (!used) return null;
    at += used;
  }
  if (tokens.length === 0) return null;
  const langs = new Set(tokens.map((tok) => tok.lang));
  if (langs.size > 1) return null;
  const source = [...langs][0];
  if (source === target) return text;
  const index = agreement(row, number, listed);
  const out = [];
  const render = (tok) => {
    if (tok.kind === "part") return target === "fr" ? tok.item.fr[index] : tok.item.en;
    if (tok.kind === "adv") return tok.item[target];
    return tok.item[target];
  };
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.kind === "adv" || tok.kind === "part") {
      if (target === "fr") {
        // "finely chopped": the adverbs come after the word in French.
        const run = [];
        while (i < tokens.length && tokens[i].kind === "adv") run.push(tokens[i++]);
        if (i >= tokens.length || tokens[i].kind !== "part") return null;
        out.push({ text: [render(tokens[i]), ...run.map(render)].join(" "), sep: tokens[i].sep });
      } else {
        // « haché finement »: the adverbs come before the word in English.
        if (tok.kind === "adv") return null;
        const run = [];
        while (tokens[i + 1] && tokens[i + 1].kind === "adv") run.push(tokens[++i]);
        out.push({ text: [...run.map(render), render(tok)].join(" "), sep: tokens[i].sep });
      }
    } else {
      out.push({ text: render(tok), sep: tok.sep });
    }
  }
  return out.map((piece, i) => piece.text + (i < out.length - 1 ? piece.sep || " " : "")).join("");
}

function showReading(reading, target) {
  if (reading.type === "noun") return showNoun(reading, target);
  if (reading.type === "list") {
    const words = reading.parts.map((p) => showNoun(p, target));
    const joiner = (j) => (target === "fr" ? { and: "et", or: "ou", et: "et", ou: "ou" } : { and: "and", or: "or", et: "and", ou: "or" })[j] || j;
    return words.map((w, i) => (i === 0 ? w : `${joiner(reading.joiners[i - 1])} ${w}`)).join(" ");
  }
  const head = showReading(reading.head, target);
  const noun = headNoun(reading.head);
  const note = showNote(reading.note, target, noun.row, noun.number, listedIn(reading));
  if (note == null) return null;
  return reading.style === "bracket" ? `${head} (${note})` : `${head}, ${note}`;
}

// First words that start with a capital in the table because they are a name: Roma,
// Dijon, Worcestershire. A capital on one of them is not a sentence's capital.
const properFirstWords = new Set();
for (const row of ingredientRows) {
  for (const lang of ["en", "fr"]) {
    for (const number of ["one", "other"]) {
      for (const form of row[lang][number]) if (/^\p{Lu}/u.test(form)) properFirstWords.add(keyOf(form.split(" ")[0]));
    }
  }
}

// The shown text keeps the way the written one began: « Oignons » -> « Onions », ALL CAPS
// stays ALL CAPS. (A lower-case start is left alone: the table only starts a name with a
// capital when it is a proper name, "Worcestershire sauce".)
function mirrorCase(written, shown) {
  const letters = written.replace(/[^\p{L}]/gu, "");
  if (letters.length > 3 && letters === letters.toUpperCase()) return shown.toUpperCase();
  const first = written.match(/\p{L}/u)?.[0];
  if (first && first === first.toUpperCase() && first !== first.toLowerCase() && !properFirstWords.has(keyOf(written.split(/\s+/)[0]))) {
    return shown.charAt(0).toUpperCase() + shown.slice(1);
  }
  return shown;
}

// How many foods a name lists ("salt and pepper" is two), for words that agree with it.
const listedIn = (reading) => (reading.type === "noted" ? listedIn(reading.head) : reading.type === "list" ? reading.parts.length : 1);

const nameCache = new Map();

function translateName(name, target) {
  const written = String(name ?? "");
  const cacheKey = `${target}|${written}`;
  if (nameCache.has(cacheKey)) return nameCache.get(cacheKey);
  let shown = written;
  const reading = readName(written);
  // A name already written in the language asked for is left exactly as it is.
  if (reading && !langsOf(reading).has(target)) {
    const text = showReading(reading, target);
    if (text != null) shown = mirrorCase(written, text);
  }
  nameCache.set(cacheKey, shown);
  return shown;
}

// A recipe's ingredient name in the language asked for (the current one by default);
// the name as written when it is not known, or is already in that language.
export function ingredientName(name, lang = getLang()) {
  return translateName(name, lang);
}

// An ingredient's note ("finely chopped") in the language asked for, agreeing with the
// ingredient it belongs to. Unknown words anywhere in it, or an unknown ingredient:
// the note as written.
export function ingredientNote(note, name, lang = getLang()) {
  const written = String(note ?? "");
  if (!written.trim()) return written;
  const reading = readName(name);
  if (!reading) return written;
  const noun = headNoun(reading);
  const shown = showNote(written, lang, noun.row, noun.number, listedIn(reading));
  return shown == null ? written : mirrorCase(written, shown);
}

// Whether the table knows this name, in either language (a name that is not known is
// shown as written and is what the admin's list asks for).
export function isKnownIngredient(name) {
  return readName(name) !== null;
}

// Whether every word of a note is known.
export function isKnownNote(note) {
  const text = String(note ?? "").trim();
  if (!text) return true;
  return showNote(text, "en", { gender: "m" }, "one", 1) !== null && showNote(text, "fr", { gender: "m" }, "one", 1) !== null;
}

// For a component: the same two functions, bound to the language shown now, so the text
// changes with the FR | EN switch.
export function useIngredientNames() {
  const lang = useLang();
  return useMemo(
    () => ({
      lang,
      name: (name) => ingredientName(name, lang),
      note: (note, name) => ingredientNote(note, name, lang),
    }),
    [lang]
  );
}

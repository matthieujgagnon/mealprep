import { buildIndex, fold, keyOf } from "./ingredientTable.js";
import { EXCEPTIONS_FR, NOT_READ_FR, RULE_WORDS_FR } from "./matcherWords.js";

// The French the Inventory matcher (inventoryMatch.js) understands, built from ONE place: the
// table of ingredient names (the built-in file with Matt's changes on top, `effectiveRows`) and its
// describing words, plus the matcher's own few words (matcherWords.js). Plain JavaScript with no
// imports of the app, so a test, the Admin form's check and the wide-check script build the same
// reading the app does.
//
// Every French spelling of a row (singular and plural, accents, apostrophes and hyphens folded
// the way the table folds them) is read as the row's first English singular. That is all the table
// teaches the matcher; what to do with the English (cuts, colours, "made into" words, taught
// links, meals) stays the matcher's rules. Only French is read: a row's other English spellings
// (cilantro / coriander) are not, because "ground coriander" must stay apart from cilantro.
//
// Who wins when two places give the same spelling: the exceptions, then the matcher's own words,
// then the table's rows (Matt's first), then the table's describing words.

// The English a row's French is read as: lower case, no accents, no apostrophes, like the matcher
// writes everything.
const english = (text) => fold(text).replace(/['’]/g, " ");

// [[frenchKey, english]] in the order they win. `skip`: more spellings never to read (the matcher's
// little words).
export function frenchPairs(rows, describingCells = [], skip = new Set()) {
  const unread = new Set([...NOT_READ_FR, ...skip, ...buildIndex(rows).ambiguous]);
  const pairs = [];
  const seen = new Set();
  const add = (key, to, always = false) => {
    if (!key || seen.has(key) || (!always && unread.has(key))) return;
    seen.add(key);
    pairs.push([key, to]);
  };
  for (const [fr, en] of EXCEPTIONS_FR) add(fr, en, true);
  for (const [fr, en] of RULE_WORDS_FR) add(fr, en, true);
  for (const row of rows) {
    const to = english(row.en.one[0]);
    if (!to) continue;
    for (const number of ["one", "other"]) for (const form of row.fr[number]) add(keyOf(form), to);
  }
  for (const cells of describingCells) for (const form of cells.slice(1, 5)) add(keyOf(form), english(cells[0]));
  return pairs;
}

// The lookups toEnglish uses: single words, and phrases (longest first) found anywhere in a name.
export function buildFrenchReading(rows, describingCells = [], skip = new Set()) {
  const words = new Map();
  const phrases = [];
  for (const [key, to] of frenchPairs(rows, describingCells, skip)) {
    if (key.includes(" ")) phrases.push([key, to]);
    else words.set(key, to);
  }
  phrases.sort((a, b) => b[0].length - a[0].length);
  const phraseRe = phrases.length ? new RegExp(`(?<![a-z])(${phrases.map(([fr]) => fr.replace(/ /g, "[- ]+")).join("|")})(?![a-z])`, "g") : null;
  const phraseMap = new Map(phrases.map(([fr, to]) => [fr.replace(/ /g, ""), to]));
  return { words, phraseRe, phraseMap };
}

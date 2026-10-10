// Splits a step's text into paragraphs for Cook mode, so a long step reads as short
// pieces instead of one block. This is for drawing only: the recipe keeps its text
// exactly as it was saved, and `stepParagraphText` is only ever given to the screen.
//
// A paragraph ends where a sentence ends (a . ! or ? ) and the next one starts with a
// capital letter. A period is not a sentence end, and nothing is split, when it follows
//   - a number ("Step 2. Chop", "to 350. Bake") or a single letter ("vitamin C. Then"),
//   - an abbreviation, English or French ("2 tbsp. Olive oil", "env. 5 min. Ensuite",
//     "c.à.s.", "p. ex."),
// because those are far more often the middle of a sentence than its end. The one
// exception to the number rule is a temperature: a period right after °F or °C ends the
// sentence ("Preheat to 350 °F. Line a sheet." is two paragraphs). When in doubt it
// does not split.

// Abbreviations that carry a period in the middle of a sentence, lower case, no period.
const ABBREVIATIONS = new Set([
  // English
  "tbsp", "tbsps", "tbs", "tsp", "tsps", "oz", "lb", "lbs", "approx", "min", "mins", "hr", "hrs", "sec", "secs",
  "pkg", "pkgs", "qt", "pt", "gal", "doz", "ca", "incl", "etc", "vs", "dr", "mr", "mrs", "ms", "st", "mt", "inc", "ltd", "jr", "sr",
  // French
  "env", "ex", "qté", "qte", "pqt", "cuil", "po", "pi", "max", "tr", "éq",
]);

// A period (or ! ?), anything that closes right after it, spaces, then the next
// sentence's first letter in capitals (É and À count), maybe after an opening quote.
const SENTENCE_END = /([.!?]+)(["'”’»)\]]*)([^\S\n]+)(?=["'“«(¿¡]?\p{Lu})/gu;

const ENDS_IN_NUMBER = /[\d½⅓⅔¼¾⅛]$/u;
const ENDS_IN_DEGREES = /(?:[°º]\s?[FC]|\b(?:degrees?|degrés?)\s+[FC])$/iu;
const DOTTED_INITIALS = /^(?:\p{L}\.)+\p{L}$/u;

// Whether the period that ends `before` really ends a sentence.
function endsSentence(before) {
  if (ENDS_IN_DEGREES.test(before)) return true;
  const word = (before.match(/\S*$/)?.[0] ?? "").replace(/^[("'“«[]+/u, "");
  if (!word) return false;
  if (ENDS_IN_NUMBER.test(word)) return false;
  const bare = word.replace(/[^\p{L}\d.]+$/u, "");
  if (/^\p{L}$/u.test(bare)) return false;
  if (DOTTED_INITIALS.test(bare)) return false;
  return !ABBREVIATIONS.has(bare.toLowerCase());
}

function splitLine(line) {
  const pieces = [];
  let start = 0;
  for (const m of line.matchAll(SENTENCE_END)) {
    const [, stops, closers, gap] = m;
    const last = stops[stops.length - 1];
    const real = stops.length > 1 || last !== "." || endsSentence(line.slice(0, m.index));
    if (!real) continue;
    pieces.push(line.slice(start, m.index + stops.length + closers.length));
    start = m.index + stops.length + closers.length + gap.length;
  }
  pieces.push(line.slice(start));
  return pieces;
}

// The paragraphs of a step's text, as a list.
export function splitStepParagraphs(text) {
  if (typeof text !== "string") return [];
  return text.split("\n").flatMap((line) => splitLine(line).map((p) => p.trim()).filter(Boolean));
}

// The same, as the one string Cook mode draws with `white-space: pre-line`: a blank
// line between paragraphs, and lines that were already separate kept as they were.
export function stepParagraphText(text) {
  if (typeof text !== "string" || !text.trim()) return "";
  return text
    .split("\n")
    .map((line) => (line.trim() ? splitLine(line).map((p) => p.trim()).join("\n\n") : ""))
    .join("\n");
}

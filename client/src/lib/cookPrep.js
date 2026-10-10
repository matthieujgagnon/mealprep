import { fold } from "./bilingual.js";
import { splitStepParagraphs } from "./stepParagraphs.js";
import { stepBody, stepIngredients } from "./steps.js";

// What Cook mode's "Before you start" page is made of, worked out from the recipe as it
// is saved (design: docs/design/riso-v2-cook-mode-prep/). Nothing here is saved or
// changes the recipe, and there is no AI: it reads each ingredient's own notes ("diced",
// « haché ») with small word lists in English and French.
//
//   - rows: every ingredient whose notes say something to do to it;
//   - groups: Cut, Measure, Squeeze / zest, Other, in that order, empty ones left out;
//   - a "how" line for each, built from the note ("diced" -> "Dice");
//   - the steps that use the ingredient, by the one matching "For this step" uses;
//   - "Do first": the recipe's own preheat sentence, with both °C and °F.

export const PREP_GROUPS = ["cut", "measure", "squeeze", "other"];

const letters = "(?<![\\p{L}])";
const noLetter = "(?![\\p{L}])";
const phrases = (source) => new RegExp(`${letters}(?:${source})${noLetter}`, "giu");

// ---------------------------------------------------------------------------
// Notes that are not preparation
// ---------------------------------------------------------------------------

// Said about the ingredient, not something to do with it: how much to use, how to serve
// it, what to buy. A note made only of these is left off the page; in a note that also
// says something to do ("diced, to taste"), they are dropped and the rest is kept.
const NOT_PREP = [
  phrases(
    [
      // English
      "to taste", "as needed", "if needed", "if desired", "optional", "divided",
      "plus (?:more|extra)(?: for [a-z ]+)?", "or (?:more|less)", "or to taste",
      "for (?:serving|garnish|garnishing|topping|dusting|drizzling|brushing|greasing|frying|sprinkling|the pan)",
      "(?:low|reduced|no)[- ](?:sodium|salt)(?:[- ]added)?", "salt[- ]reduced", "unsalted", "salted", "organic",
      "store[- ]bought", "homemade", "good[- ]quality", "preferably [a-z ]+",
      "boneless", "skinless", "bone[- ]in", "skin[- ]on",
      // French
      "au go[uû]t", "selon le go[uû]t", "au besoin", "si d[ée]sir[ée]", "facultati(?:f|ve)s?", "optionnel(?:le)?s?",
      "divis[ée]e?s?", "en plus", "ou plus", "ou moins",
      "pour (?:servir|garnir|garnitur[e]|saupoudrer|badigeonner|graisser|la friture|la cuisson|le service)",
      "faible en sodium", "r[ée]duit(?:e)? en sodium", "sans sel ajout[ée]", "non sal[ée]e?s?", "sal[ée]e?s?",
      "biologiques?", "du commerce", "maison", "de bonne qualit[ée]", "de pr[ée]f[ée]rence [a-zà-ÿ ]+",
      "d[ée]soss[ée]e?s?", "sans peau", "sans os", "avec la peau", "avec os",
    ].join("|")
  ),
];

// A note that is only an amount or a package size ("796 ml", "14 oz can", "about 2 lb").
const SIZE_ONLY = new RegExp(
  "^(?:about |approx\\.? |approximately |environ |env\\.? )?\\d+(?:[.,/]\\d+)?\\s*(?:ml|l|g|kg|oz|fl\\.? ?oz|lb|lbs|cl|dl)\\.?" +
    "(?: (?:can|jar|tin|package|pkg|bag|box|carton|bo[iî]te|bocal|sac|paquet|conserve))?$",
  "iu"
);

// The note as the page uses it: brackets, spaces and the not-prep phrases taken off.
// "" means nothing to do to this ingredient, so it is not listed.
export function prepNote(raw) {
  let note = String(raw ?? "").replace(/\s+/g, " ").trim();
  note = note.replace(/^\((.*)\)$/, "$1").trim();
  if (SIZE_ONLY.test(note)) return "";
  for (const re of NOT_PREP) note = note.replace(re, " ");
  note = note
    .replace(/\s+/g, " ")
    .replace(/\s+([,;.])/g, "$1")
    .replace(/(?:[,;]\s*){2,}/g, ", ")
    .replace(/^[\s,;.:&-]+|[\s,;.:&-]+$/g, "")
    .replace(/^(?:and|or|et|ou)\s+/i, "")
    .replace(/\s+(?:and|or|et|ou)$/i, "")
    .replace(/^[\s,;.:&-]+|[\s,;.:&-]+$/g, "");
  return /\p{L}|\d/u.test(note) ? note : "";
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

// Word lists, accents folded. The first group a note has a word of wins, in this order:
// squeeze / zest, cut, measure, and anything else is Other.
const SQUEEZE = new Set(
  "zest zested zesting zests juice juiced juicing squeeze squeezed press pressed zeste zestes zestee zestees zester jus presse pressee pressees presses presser exprime exprimee".split(" ")
);
const CUT = new Set(
  (
    "dice diced slice sliced slices mince minced chop chopped cut cube cubed cubes halve halved quarter quartered quarters julienne julienned shred shredded grate grated peel peeled trim trimmed core cored seed seeded pit pitted devein deveined crush crushed smash smashed wedge wedges round rounds strip strips piece pieces chunk chunks floret florets snip snipped hull hulled stem stemmed " +
    "hache haches hachee hachees hacher emince eminces emincee emincees emincer tranche tranches tranchee tranchees trancher coupe coupes coupee coupees couper cubes quartier quartiers rondelles lanieres morceaux moities lamelles batonnets brunoise rape rapes rapee rapees raper pele peles pelee pelees peler epepine epepinee denoyaute denoyautee pare paree ecrase ecrasee ecrases ecrasees concasse concassee cisele ciselee ciseles ciselees effiloche effilochee equeute equeutee ebarbe"
  ).split(" ")
);
// "en dés", « en petits dés »: des is « dés » without its accent
const CUT_SHAPE = /(?:^|\s)en (?:(?:petits?|gros|fins?|fines?|petites|grosses) )?(?:des|cubes|quartiers|tranches|rondelles|lanieres|morceaux|julienne|moities|lamelles|batonnets|brunoise|croissants|demi-lunes|rubans|copeaux|miettes?)(?:\s|$)/;
const MEASURE = new Set(
  "measure measured packed heaping heaped level leveled levelled scant rounded mesure mesuree mesures mesurees tasse tassee tassees comble combles rase rasee rasees".split(" ")
);

const foldWords = (text) => fold(text).split(/[^a-z]+/).filter(Boolean);

// "cut" | "measure" | "squeeze" | "other"
export function prepGroup(note) {
  const folded = fold(note);
  const words = foldWords(note);
  if (words.some((w) => SQUEEZE.has(w))) return "squeeze";
  if (words.some((w) => CUT.has(w)) || CUT_SHAPE.test(folded)) return "cut";
  if (words.some((w) => MEASURE.has(w))) return "measure";
  return "other";
}

// ---------------------------------------------------------------------------
// The how line
// ---------------------------------------------------------------------------

const EN_VERBS = {
  diced: "dice", sliced: "slice", minced: "mince", chopped: "chop", cubed: "cube", halved: "halve",
  quartered: "quarter", julienned: "julienne", shredded: "shred", grated: "grate", peeled: "peel",
  trimmed: "trim", cored: "core", seeded: "seed", pitted: "pit", deveined: "devein", crushed: "crush",
  smashed: "smash", zested: "zest", juiced: "juice", squeezed: "squeeze", pressed: "press", sifted: "sift",
  drained: "drain", rinsed: "rinse", melted: "melt", softened: "soften", beaten: "beat", whisked: "whisk",
  mashed: "mash", toasted: "toast", torn: "tear", crumbled: "crumble", thawed: "thaw", stemmed: "stem",
  hulled: "hull", shelled: "shell", measured: "measure", cut: "cut", separated: "separate", snipped: "snip",
  washed: "wash", scrubbed: "scrub", patted: "pat",
};
const EN_ADVERBS = new Set("thinly finely roughly coarsely lightly freshly evenly well very".split(" "));
const EN_JOIN = new Set(["and", "or", "then"]);

// French: the masculine form without its accent, then « vous ». The other forms follow
// (-s, -e, -es: haché, hachés, hachée, hachées). « zeste » is left out on purpose: in a
// note it is the noun (« zeste et jus »), not « zesté ».
const FR_BASES = {
  hache: "hachez", emince: "émincez", tranche: "tranchez", coupe: "coupez", rape: "râpez", pele: "pelez",
  epepine: "épépinez", denoyaute: "dénoyautez", pare: "parez", ecrase: "écrasez", presse: "pressez",
  concasse: "concassez", cisele: "ciselez", egoutte: "égouttez", rince: "rincez", ramolli: "ramollissez",
  fondu: "faites fondre", battu: "battez", fouette: "fouettez", tamise: "tamisez", mesure: "mesurez",
  decongele: "décongelez", lave: "lavez", essuye: "essuyez", epluche: "épluchez",
  effiloche: "effilochez", equeute: "équeutez",
};
const FR_VERBS = {};
for (const [base, verb] of Object.entries(FR_BASES)) for (const end of ["", "s", "e", "es"]) FR_VERBS[base + end] = verb;
const FR_ADVERBS = new Set("finement grossierement legerement delicatement bien tres".split(" "));
const FR_JOIN = new Set(["et", "puis", "ou"]);

const upperFirst = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

// A short instruction made from the note. A leading run of words like "finely chopped",
// "peeled and diced" or « finement haché » turns into the order ("Finely chop",
// "Peel and dice", « Hachez finement »); a note that is only a shape (« en dés ») gets its
// verb (« Coupez en dés »). Anything else stays as written, with a capital: "cut into
// 3 cm pieces" is "Cut into 3 cm pieces". No size or step is ever added.
export function howLine(note) {
  const text = String(note || "").replace(/\s+/g, " ").trim().replace(/\.$/, "");
  if (!text) return "";

  const tokens = text.split(/(\s+|,|;)/).filter((tok) => tok !== "");
  const out = [];
  let leading = true;
  let heldAdverbs = []; // French puts the adverb after the verb
  for (const tok of tokens) {
    if (/^\s+$|^[,;]$/.test(tok)) {
      out.push(tok);
      continue;
    }
    const word = fold(tok);
    if (leading) {
      if (EN_VERBS[word]) {
        out.push(EN_VERBS[word]);
        continue;
      }
      if (FR_VERBS[word]) {
        out.push(FR_VERBS[word], ...heldAdverbs.flatMap((a) => [" ", a]));
        heldAdverbs = [];
        continue;
      }
      if (EN_ADVERBS.has(word) || EN_JOIN.has(word) || FR_JOIN.has(word)) {
        out.push(tok);
        continue;
      }
      if (FR_ADVERBS.has(word)) {
        heldAdverbs.push(tok);
        // dropped for now, put back after the verb that follows (or here if none does)
        out.push({ adverb: tok });
        continue;
      }
    }
    leading = false;
    out.push(tok);
  }

  // An adverb that no French verb took stays where it was written.
  const stillHeld = new Set(heldAdverbs);
  const line = out
    .map((part) => (typeof part === "string" ? part : stillHeld.has(part.adverb) ? part.adverb : ""))
    .join("")
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .trim();

  // « en dés », « en petits cubes »: only a shape, no verb at all
  if (line === text && CUT_SHAPE.test(fold(text)) && /^en\b/i.test(text)) return upperFirst(`coupez ${text}`);
  return upperFirst(line);
}

// ---------------------------------------------------------------------------
// Do first
// ---------------------------------------------------------------------------

// Rounded the way ovens are set: °C to the nearest 10, °F to the nearest 25
// (425 °F -> 220 °C, 220 °C -> 425 °F).
export const fahrenheitToCelsius = (f) => Math.round((((f - 32) * 5) / 9) / 10) * 10;
export const celsiusToFahrenheit = (c) => Math.round((c * 9) / 5 / 25 + 32 / 25) * 25;

const TEMPERATURE = /(\d{2,3})(?:\s*(?:-|–|to|à)\s*(\d{2,3}))?\s*(?:°|º|degrees?|degrés?)?\s*([FC])(?![\p{L}])/giu;

// The same sentence with the other unit added after each temperature, written the same
// way: "Preheat the oven to 425°F." -> "Preheat the oven to 425 °F (220 °C)." A sentence that
// already has both units, or no temperature, is left as it is.
export function withBothTemperatures(sentence) {
  const found = [...sentence.matchAll(TEMPERATURE)];
  if (found.length === 0) return sentence;
  if (new Set(found.map((m) => m[3].toUpperCase())).size > 1) return sentence;
  return sentence.replace(TEMPERATURE, (match, from, to, unit) => {
    const toC = unit.toUpperCase() === "F";
    const convert = toC ? fahrenheitToCelsius : celsiusToFahrenheit;
    const own = to ? `${from}–${to}` : from;
    const other = to ? `${convert(Number(from))}–${convert(Number(to))}` : String(convert(Number(from)));
    return `${own} °${toC ? "F" : "C"} (${other} °${toC ? "C" : "F"})`;
  });
}

const PREHEAT = /(?<![\p{L}])(?:pre-?heat|heat (?:the |your )?(?:oven|broiler|grill|air fryer)|pr[ée]chauff|chauffez? (?:le |votre )?(?:four|gril)|mettez le four)/iu;

// The first oven or pan setup sentence in the steps, in order: one that says preheat
// (« préchauffer »), or heat the oven. It is the recipe's own sentence, with both °C and
// °F. null when no step has one.
export function doFirstSentence(steps) {
  for (const step of steps || []) {
    for (const sentence of splitStepParagraphs(stepBody(step))) {
      if (PREHEAT.test(sentence)) return withBothTemperatures(sentence.trim());
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

// Everything the page shows, for the steps Cook mode walks through (headings already
// taken out, so the numbers are the rail's):
//   rows    { ingredient, note, how, group, stepNumbers }, in the recipe's order
//   groups  [{ id, rows }] for the groups that have rows, in the page's order
//   doFirst the sentence, or null
export function buildPrep(ingredients, steps) {
  const usedBy = (steps || []).map((step) => new Set(stepIngredients(step, ingredients || [])));
  const rows = [];
  for (const ingredient of ingredients || []) {
    const note = prepNote(ingredient.notes);
    if (!note) continue;
    const stepNumbers = [];
    usedBy.forEach((set, i) => {
      if (set.has(ingredient)) stepNumbers.push(i + 1);
    });
    rows.push({ ingredient, note, how: howLine(note), group: prepGroup(note), stepNumbers });
  }
  const groups = PREP_GROUPS.map((id) => ({ id, rows: rows.filter((r) => r.group === id) })).filter((g) => g.rows.length > 0);
  return { rows, groups, doFirst: doFirstSentence(steps) };
}

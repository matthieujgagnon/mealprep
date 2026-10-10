import { canonicalize, singularize } from "./groceryList.js";
import { PHRASES, fold, frenchToEnglish, looksFrench } from "./bilingual.js";

// Which of a recipe's ingredients a piece of text (a step) mentions. This is the one
// matching Cook mode uses for "For this step" and for the step tags on the prep page,
// so both always agree.
//
// A name matches when one of its words is in the text as a whole word:
//   - short names count ("egg", "oil", "rye", « ail », « riz »), and "rice" is not
//     found inside "price";
//   - plural or singular, either way ("tomatoes" / "tomato", « oignon » / « oignons »),
//     with the grocery list's own singular rules (`singularize`), and accents ignored;
//   - the other language counts, from the one-word French / English pairs the flyers
//     already use (`PHRASES` in bilingual.js: « ail » = garlic, « riz » = rice,
//     « œufs » = eggs), and whole phrases through `frenchToEnglish` (« pommes de terre »
//     = potatoes).
// Words that say nothing about the food (articles, colours, "fresh", "ground", ...) never
// match on their own: "red onion" is found by "onion", not by "red pepper".

const STOP = new Set(
  (
    // little words, English and French
    "a an and or of the to in for with on at without de du des la le les l d un une au aux et ou en pour avec sur sans " +
    // colours and sizes
    "red green yellow white black brown big small medium large rouge rouges vert verte verts vertes jaune jaunes blanc blanche blancs blanches noir noire noirs noires brun gros grosse petit petite moyen moyenne " +
    // how it is bought or kept, not what it is
    "fresh frozen cooked raw dried plain ground whole extra virgin light dark hot cold warm " +
    "frais fraiche surgele surgelee cuit cuite cru crue seche moulu moulue entier entiere nature vierge leger fonce chaud froid tiede"
  ).split(" ")
);

// Two French foods are ordinary words once the accent goes: « thé » (tea) is the English
// "the", and « maïs » (corn) is the French "mais" (but). They are never paired by
// spelling; "the" is dropped and a bare "mais" in a step is the "but". « maïs » (and
// « mais » as an ingredient's name) is read as "maize", which pairs with "corn".
const NOT_PAIRED = new Set(["the", "mais"]);
const MAIS = /(?<![\p{L}])ma[ïi]s(?![\p{L}])/giu;
const THE = /(?<![\p{L}])the(?![\p{L}])/giu;

function clean(text, isName) {
  return String(text || "")
    .replace(MAIS, (m) => (isName || /ï/i.test(m) ? "maize" : " "))
    .replace(THE, " ");
}

const wordsOf = (text) => fold(text).split(/[^a-z]+/).filter(Boolean);

// stem -> the stems of its other-language partners, both ways, from the one-word pairs.
const PAIRS = new Map();
function pair(a, b) {
  if (a === b || NOT_PAIRED.has(a) || NOT_PAIRED.has(b) || STOP.has(a) || STOP.has(b)) return;
  for (const [x, y] of [[a, b], [b, a]]) {
    if (!PAIRS.has(x)) PAIRS.set(x, new Set());
    PAIRS.get(x).add(y);
  }
}
for (const [fr, en] of PHRASES) {
  if (/^[a-z]+$/.test(fr) && /^[a-z]+$/.test(en)) pair(singularize(fr), singularize(en));
}
pair("maize", "corn");

const termsCache = new Map();

// The words that find this ingredient in a text: its own (singular, no accents), their
// partners in the other language and the English of a French phrase name.
export function ingredientTerms(name) {
  const key = String(name || "");
  if (termsCache.has(key)) return termsCache.get(key);

  const written = clean(key, true);
  const core = canonicalize(written).core || written;
  const own = wordsOf(core).filter((w) => w.length > 1 && !STOP.has(w));
  const terms = new Set(own);
  for (const w of own) for (const p of PAIRS.get(w) || []) terms.add(p);
  for (const w of wordsOf(frenchToEnglish(written))) {
    const s = singularize(w);
    if (s.length > 1 && !STOP.has(s)) terms.add(s);
  }

  termsCache.set(key, terms);
  return terms;
}

// The words of a text as whole words (singular, no accents). A French text also gets the
// English of the foods it names, so « pommes de terre » is found by "potatoes".
export function textWords(text) {
  const plain = clean(text, false);
  const words = new Set(wordsOf(plain).map(singularize));
  if (looksFrench(plain)) for (const w of wordsOf(frenchToEnglish(plain))) words.add(singularize(w));
  return words;
}

// Whether the text mentions the ingredient.
export function mentions(text, name) {
  const words = typeof text === "string" ? textWords(text) : text;
  for (const term of ingredientTerms(name)) if (words.has(term)) return true;
  return false;
}

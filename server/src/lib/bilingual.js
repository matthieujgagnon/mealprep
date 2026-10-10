// Quebec flyers name products in both languages, "pommes Cortland | apples"
// - French first on most Quebec flyers, though not always ("Bananas |
// bananes importées"). Prices are compared and matched to recipes and to
// Statistics Canada's averages by the English name, so this works out
// which half is which from the words themselves.
// Keep in step with client/src/lib/bilingual.js.

const FRENCH = new Set(
  "de du des la le les l d ou au aux et avec sans en pour sur frais fraiche fraiches surgele surgeles surgelees produit choix varie variees sac format boite paquet pommes pomme terre poulet boeuf porc veau agneau dinde jambon fromage lait beurre oeufs pain poitrines poitrine cuisses cuisse hauts hache hachee haches maigre mi saucisses saucisse filets cotes cote roti bifteck crevettes saumon truite thon morue poisson tomates oignons carottes raisins fraises bleuets framboises citrons poires peches bananes ananas champignons poivrons laitue chou celeri courge courgettes epinards haricots mais patates douces ail jus vin biere eau cafe the yogourt creme glacee croustilles biscuits cereales pates riz huile sucre farine sauce soupe noix entiers entieres tranche tranches fume desosse desossees rouges rouge verts vert jaunes jaune blancs blanc noirs gros grosse petites petits pate pates ailes ailles escalope escalopes simili cuit cuite cuits cuites chaud pane panes panees lanieres pilons brochettes boulettes croquettes aiglefin goberge fletan bavette surlonge palette gigot darne emince jarret flanc charcuteries tourtiere condense evapore chocolat gateau croustillants assaisonne assaisonnes assaisonnees marine marines marinees bouillir viande viandes".split(" ")
);
const ENGLISH = new Set(
  "of or and with the for in on fresh frozen product assorted selected bag box pack apples apple potatoes potato chicken beef pork veal lamb turkey ham cheese milk butter eggs bread breasts breast thighs legs ground lean extra sausages sausage fillets fillet steak roast shrimp salmon trout tuna cod fish tomatoes onions carrots grapes strawberries blueberries raspberries lemons pears peaches bananas pineapple mushrooms peppers lettuce cabbage celery squash zucchini spinach beans corn sweet garlic juice wine beer water coffee tea yogurt cream ice chips cookies cereal pasta rice oil sugar flour soup nuts whole sliced smoked boneless red green yellow white black large small pie pies wings cutlets mock cooked breaded strips drumsticks skewers meatballs nuggets haddock pollock halibut sirloin blade leg shank deli meats condensed evaporated chocolate cake crispy seasoned marinated boiling meat hot roasted".split(" ")
);

export const fold = (text) =>
  String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/gi, "oe")
    .toLowerCase();

// How English a piece of text reads: English words count up, French words
// and accented letters count down.
function englishScore(text) {
  const accents = (String(text).match(/[éèêëàâîïôûùüçœ]/gi) || []).length;
  let score = -accents;
  for (const word of fold(text).split(/[^a-z]+/)) {
    if (ENGLISH.has(word)) score++;
    if (FRENCH.has(word)) score--;
  }
  return score;
}

// "pommes Cortland | apples, 4 lb bag" -> { en: "apples, 4 lb bag",
// fr: "pommes Cortland" }. A name without " | " is { en: name, fr: null },
// whatever its language.
export function splitBilingual(text) {
  const parts = String(text || "")
    .split(/\s*\|\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return { en: parts[0] || "", fr: null };
  const [a, b] = [parts[0], parts.slice(1).join(" | ")];
  // The half that reads more English; the first when they read the same.
  return englishScore(b) > englishScore(a) ? { en: b, fr: a } : { en: a, fr: b };
}

// French-only names ("BŒUF HACHÉ MAIGRE", common at Maxi) in English, so
// they line up with the same product at other stores and with Statistics
// Canada's averages. Only the grocery words that name or describe the
// product are translated; anything else is left out. Longer phrases come
// first: "pâté chinois" is shepherd's pie before "pâté" is pie.
export const PHRASES = [
  ["pommes de terre", "potatoes"], ["patates douces", "sweet potatoes"], ["patates", "potatoes"],
  ["hauts de cuisses", "thighs"], ["haut de cuisse", "thigh"], ["poitrines", "breasts"], ["poitrine", "breast"],
  ["cuisses", "legs"], ["cuisse", "leg"], ["pilons", "drumsticks"], ["ailes", "wings"], ["ailles", "wings"], ["aile", "wing"],
  ["filets", "fillets"], ["filet", "fillet"], ["lanieres", "strips"], ["escalopes", "cutlets"], ["escalope", "cutlet"],
  ["brochettes", "skewers"], ["boulettes de viande", "meatballs"], ["boulettes", "meatballs"], ["croquettes", "nuggets"],
  ["burgers", "burgers"], ["burger", "burger"], ["tournedos", "tournedos"], ["souvlaki", "souvlaki"],
  ["cotelettes", "chops"], ["longe", "loin"], ["roti", "roast"], ["bifteck", "steak"], ["darnes", "steaks"], ["darne", "steak"], ["emince", "shaved"], ["eminces", "shaved"], ["cotes levees", "ribs"], ["cotes", "ribs"],
  ["contre-filet", "strip loin"], ["surlonge", "sirloin"], ["bas de palette", "blade"], ["palette", "blade"], ["bavette", "flank steak"],
  ["gigot", "leg"], ["jarrets", "shanks"], ["jarret", "shank"], ["flanc", "belly"], ["cubes", "cubes"],
  ["mi-maigre", "medium"], ["extra-maigre", "extra lean"], ["maigre", "lean"], ["hache", "ground"], ["hachee", "ground"], ["haches", "ground"],
  ["boeuf", "beef"], ["porc", "pork"], ["poulet", "chicken"], ["dinde", "turkey"], ["dindon", "turkey"], ["veau", "veal"], ["agneau", "lamb"],
  ["jambon", "ham"], ["saucisses", "sausages"], ["saucisse", "sausage"], ["bacon", "bacon"], ["viandes", "meats"], ["viande", "meat"],
  ["charcuteries", "deli meats"], ["charcuterie", "deli meats"], ["pepperoni", "pepperoni"], ["salami", "salami"], ["prosciutto", "prosciutto"],
  ["saumon", "salmon"], ["truite", "trout"], ["crevettes", "shrimp"], ["thon", "tuna"], ["morue", "cod"], ["tilapia", "tilapia"], ["petoncles", "scallops"],
  ["sole", "sole"], ["aiglefin", "haddock"], ["goberge", "pollock"], ["fletan", "halibut"], ["moules", "mussels"], ["homard", "lobster"], ["poisson", "fish"],
  ["pxpie chinois", "shepherd's pie"], ["pxpies", "pies"], ["pxpie", "pie"], ["pate chinois", "shepherd's pie"], ["tourtiere", "meat pie"], ["pate feuilletee", "puff pastry"], ["pate a pizza", "pizza dough"],
  ["pate a tarte", "pie crust"], ["pate brisee", "pie crust"], ["pate phyllo", "phyllo pastry"], ["pate pour", "dough"], ["pates", "pasta"], ["pate", "pie"], ["tartes", "pies"], ["tarte", "pie"], ["quiche", "quiche"], ["pizza", "pizza"],
  ["pommes", "apples"], ["pomme", "apple"], ["bananes", "bananas"], ["tomates raisins", "grape tomatoes"], ["raisins", "grapes"], ["fraises", "strawberries"], ["bleuets", "blueberries"],
  ["framboises", "raspberries"], ["citrons", "lemons"], ["limes", "limes"], ["oranges", "oranges"], ["mandarines", "mandarins"], ["clementines", "clementines"],
  ["poires", "pears"], ["peches", "peaches"], ["prunes", "plums"], ["cerises", "cherries"], ["ananas", "pineapple"], ["mangues", "mangoes"],
  ["avocats", "avocados"], ["melon d'eau", "watermelon"], ["cantaloup", "cantaloupe"], ["kiwis", "kiwis"],
  ["tomates cerises", "cherry tomatoes"], ["tomates", "tomatoes"], ["oignons", "onions"], ["carottes", "carrots"], ["champignons", "mushrooms"],
  ["poivrons", "peppers"], ["laitue", "lettuce"], ["brocoli", "broccoli"], ["chou-fleur", "cauliflower"], ["chou", "cabbage"],
  ["concombres", "cucumbers"], ["celeri", "celery"], ["epinards", "spinach"], ["courgettes", "zucchini"], ["courge", "squash"],
  ["haricots verts", "green beans"], ["mais", "corn"], ["ail", "garlic"], ["asperges", "asparagus"], ["betteraves", "beets"],
  ["fromage a la creme", "cream cheese"], ["fromage", "cheese"], ["lait", "milk"], ["beurre d'arachide", "peanut butter"], ["beurre", "butter"],
  ["oeufs", "eggs"], ["yogourt", "yogurt"], ["creme glacee", "ice cream"], ["creme", "cream"], ["pain", "bread"],
  ["gateau", "cake"], ["crumble", "crumble"], ["chocolat", "chocolate"], ["soupes", "soups"], ["soupe", "soup"], ["biscuits", "cookies"], ["barres", "bars"], ["barre", "bar"], ["confiture", "jam"], ["tartinade", "spread"], ["croustilles", "chips"], ["frites", "fries"], ["trempette", "dip"],
  ["riz", "rice"], ["farine", "flour"], ["sucre", "sugar"], ["huile d'olive", "olive oil"], ["huile", "oil"],
  ["cafe", "coffee"], ["the", "tea"], ["jus d'orange", "orange juice"], ["jus de pomme", "apple juice"], ["jus", "juice"],
  ["vin", "wine"], ["biere", "beer"], ["eau", "water"], ["sirop d'erable", "maple syrup"], ["miel", "honey"],
  ["frais", "fresh"], ["fraiche", "fresh"], ["entiers", "whole"], ["entier", "whole"], ["tranche", "sliced"], ["tranches", "sliced"], ["tranchees", "sliced"],
  ["fume", "smoked"], ["fumes", "smoked"], ["fumee", "smoked"], ["desosse", "boneless"], ["desossees", "boneless"], ["desosses", "boneless"],
  ["surgele", "frozen"], ["surgeles", "frozen"], ["surgelees", "frozen"],
  ["simili", "mock"], ["chaud", "hot"], ["cuit", "cooked"], ["cuite", "cooked"], ["cuits", "cooked"], ["cuites", "cooked"], ["cuisinees", "cooked"], ["cuisines", "cooked"],
  ["pane", "breaded"], ["panes", "breaded"], ["panee", "breaded"], ["panees", "breaded"],
  ["assaisonne", "seasoned"], ["assaisonnes", "seasoned"], ["assaisonnees", "seasoned"], ["marine", "marinated"], ["marines", "marinated"], ["marinees", "marinated"],
  ["a bouillir", "boiling"], ["condense", "condensed"], ["evapore", "evaporated"], ["sucre", "sweetened"], ["croustillants", "crispy"], ["croustillant", "crispy"],
  ["rouges", "red"], ["rouge", "red"], ["verts", "green"], ["vert", "green"], ["jaunes", "yellow"], ["jaune", "yellow"],
  ["blancs", "white"], ["blanc", "white"], ["gros", "large"], ["grosses", "large"],
];
// Describing words, in the order English puts them.
const ADJECTIVES = [
  "fresh", "frozen", "mock", "hot", "cooked", "boiling", "breaded", "seasoned", "marinated", "smoked", "crispy", "large", "extra", "lean",
  "medium", "boneless", "whole", "sliced", "shaved", "red", "green", "yellow", "white", "ground", "cherry", "sweet", "sweetened", "condensed", "evaporated",
];
const PHRASE_RE = new RegExp(`(?<![a-z'-])(${PHRASES.map(([fr]) => fr.replace(/[-' ]/g, "[-' ]*")).join("|")})(?![a-z'-])`, "g");
const PHRASE_MAP = new Map();
for (const [fr, en] of PHRASES) {
  const key = fr.replace(/[-' ]/g, "");
  // "sucre" is sugar as a product and sweetened after another word
  // ("lait condensé sucré").
  if (!PHRASE_MAP.has(key)) PHRASE_MAP.set(key, en);
}

export function looksFrench(text) {
  return englishScore(text) < 0;
}

// "bœuf haché maigre" -> "lean ground beef", "poitrines de poulet" ->
// "chicken breasts", "pommes cortland" -> "apples" (a variety name stays
// out), "gigot d'agneau" -> "lamb leg": French "X de Y" reads "Y X" in
// English, and describing words go first.
export function frenchToEnglish(text) {
  const describing = new Set();
  const nouns = [];
  // "pâte" is dough and "pâté" a pie, which folding the accents would
  // lose: "PÂTE À TARTE" is pie crust, "PÂTÉ AU POULET" chicken pie.
  const marked = String(text || "").replace(/p[aâ]t[ée](s?)(?![\p{L}])/giu, (m, plural) => (/[éÉ]/.test(m) ? `pxpie${plural}` : m));
  // "d'agneau", "l'érable": the elided article is its own word.
  const folded = fold(marked).replace(/(^|[^a-z])([dlj])['’](?=[a-z])/g, "$1$2' ");
  let first = true;
  for (const m of folded.matchAll(PHRASE_RE)) {
    const key = m[1].replace(/[-' ]/g, "");
    let en = PHRASE_MAP.get(key);
    if (!en) continue;
    if (key === "sucre" && !first) en = "sweetened";
    first = false;
    if (en.split(" ").every((w) => ADJECTIVES.includes(w))) en.split(" ").forEach((w) => describing.add(w));
    else if (!nouns.includes(en)) nouns.push(en);
  }
  return [...ADJECTIVES.filter((w) => describing.has(w)), ...nouns.reverse()].join(" ");
}

// The foods a product name can end on - what tells "black forest smoked
// ham" (a product) from "old fashioned" (a style of one).
const FOOD_NOUNS = new Set(
  [
    ...PHRASES.map(([, en]) => en.split(" ").pop()).filter((w) => !ADJECTIVES.includes(w)),
    ..."paste dressing ketchup mayonnaise salsa fries dough crust pastry bites pops pockets dinner combo platter lasagna nuggets kebab souvlaki wellington ham bacon wieners hot dogs chicken beef pork veal lamb turkey fish salmon trout tuna cod shrimp scallops lobster crab mussels oysters tilapia haddock sole halibut pollock steak steaks roast roasts chops ribs loin tenderloin tenderloins shoulder belly brisket fillet fillets breast breasts thighs legs drumsticks wings cutlets nuggets strips burgers patties meatballs sausages sausage pie pies pizza lasagna quiche tofu eggs cheese milk butter cream yogurt bread buns bagels apples pears grapes tomatoes potatoes onions carrots peppers lettuce berries juice coffee tea cereal pasta rice sauce soup chips cookies crackers".split(" "),
  ].map((w) => singular(w))
);

function singular(word) {
  const w = String(word || "").toLowerCase();
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(oes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

// Whether a name ends on a food: "black forest smoked ham" yes, "old
// fashioned" and "air chilled" no.
export function endsOnFood(text) {
  const words = fold(text).split(/[^a-z]+/).filter(Boolean);
  return words.length > 0 && FOOD_NOUNS.has(singular(words[words.length - 1]));
}

// Whether one word is a food: "pie" yes, "irresistible" no.
export function isFoodWord(word) {
  return FOOD_NOUNS.has(singular(fold(word)));
}

// Whether a name names any food at all.
export function namesFood(text) {
  return fold(text)
    .split(/[^a-z]+/)
    .some((w) => w && FOOD_NOUNS.has(singular(w)));
}

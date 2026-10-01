// Quebec flyers name products in both languages, "pommes Cortland | apples"
// - French first on most Quebec flyers, though not always ("Bananas |
// bananes importées"). Prices are compared and matched to recipes and to
// Statistics Canada's averages by the English name, so this works out
// which half is which from the words themselves.
// Keep in step with server/src/lib/bilingual.js.

const FRENCH = new Set(
  "de du des la le les l d ou au aux et avec sans en pour sur frais fraiche fraiches surgele surgeles surgelees produit choix varie variees sac format boite paquet pommes pomme terre poulet boeuf porc veau agneau dinde jambon fromage lait beurre oeufs pain poitrines poitrine cuisses cuisse hauts hache hachee haches maigre mi saucisses saucisse filets cotes cote roti bifteck crevettes saumon truite thon morue poisson tomates oignons carottes raisins fraises bleuets framboises citrons poires peches bananes ananas champignons poivrons laitue chou celeri courge courgettes epinards haricots mais patates douces ail jus vin biere eau cafe the yogourt creme glacee croustilles biscuits cereales pates riz huile sucre farine sauce soupe noix entiers entieres tranche tranches fume desosse desossees rouges rouge verts vert jaunes jaune blancs blanc noirs gros grosse petites petits".split(" ")
);
const ENGLISH = new Set(
  "of or and with the for in on fresh frozen product assorted selected bag box pack apples apple potatoes potato chicken beef pork veal lamb turkey ham cheese milk butter eggs bread breasts breast thighs legs ground lean extra sausages sausage fillets fillet steak roast shrimp salmon trout tuna cod fish tomatoes onions carrots grapes strawberries blueberries raspberries lemons pears peaches bananas pineapple mushrooms peppers lettuce cabbage celery squash zucchini spinach beans corn sweet garlic juice wine beer water coffee tea yogurt cream ice chips cookies cereal pasta rice oil sugar flour soup nuts whole sliced smoked boneless red green yellow white black large small".split(" ")
);

const fold = (text) =>
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

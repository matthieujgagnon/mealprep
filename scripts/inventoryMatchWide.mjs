// The wide check behind client/src/lib/inventoryMatchWide.test.js.
//
//   node scripts/inventoryMatchWide.mjs names     writes the list of names (fixtures/inventoryMatchNames.json)
//   node scripts/inventoryMatchWide.mjs matches [file [matcher.js]]
//        asks the matcher (inventoryMatch.js, or another copy of it: to compare with an older one), for every name as an Inventory item and every name as a
//        recipe ingredient, whether the item covers the ingredient, and writes the
//        answers (default fixtures/inventoryMatchBaseline.json)
//
// The names are real ones: TheMealDB's ingredient list, FoodKeeper's products, every
// spelling of the ingredient names table (ingredientDisplay.txt, English and French) and the
// matcher's own French words (matcherWords.js), the flyers' word pairs, and the names the
// tests and the browser tests already use. Add names by adding them to EXTRA in
// this file or to the sources above, then run `names` and `matches`; look at what
// changed before you commit it: a match that disappears must be a wrong match going away.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { builtInRowsOf, fold, parseTable } from "../client/src/lib/ingredientTable.js";

// The matcher reads the ingredient names table with Vite's `?raw` import, which plain Node does not
// know: this hook gives it the file's text.
register(
  "data:text/javascript," +
    encodeURIComponent(`
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function load(url, context, nextLoad) {
  if (url.endsWith("?raw")) {
    const text = readFileSync(fileURLToPath(url.slice(0, -4)), "utf8");
    return { format: "module", shortCircuit: true, source: "export default " + JSON.stringify(text) };
  }
  return nextLoad(url, context);
}`),
  import.meta.url
);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = join(root, "client/src/lib/fixtures");
const read = (p) => readFileSync(join(root, p), "utf8");

// Names the rules were written for: the ones Matt's recipes and Inventory use.
const EXTRA = [
  "rice vinegar", "rice wine vinegar", "seasoned rice vinegar", "apple cider vinegar", "cider vinegar", "red vinegar", "red wine vinegar", "white wine vinegar",
  "wine vinegar", "balsamic vinegar", "balsamic", "vinegar", "white vinegar", "dijon mustard", "dijon", "mustard", "sriracha", "sriracha sauce", "hoisin sauce", "hoisin",
  "low sodium soy sauce", "low-sodium soy sauce", "reduced sodium soy sauce", "reduced-sodium soy sauce", "dark soy sauce", "soy sauce", "light soy sauce",
  "low fat milk", "reduced fat sour cream", "fat free yogurt", "full fat coconut milk", "no salt added tomato paste", "liquid honey", "honey",
  "garlic bulb", "garlic", "fennel bulb", "fennel", "lime", "limes", "lime juice", "lime zest", "lemon", "lemon juice", "lemon zest", "orange", "orange zest", "orange juice",
  "coriander", "fresh coriander", "coriander leaves", "cilantro", "ground coriander", "coriander seeds", "lime leaves", "kaffir lime leaves", "banana leaves", "grape leaves",
  "vine leaves", "curry leaves", "grapes", "raisins", "bananas", "seasoned salt", "salt", "unwaxed lemon", "worcestershire sauce", "tabasco", "tabasco sauce", "teriyaki sauce",
  "teriyaki", "tahini", "tahini paste", "miso", "miso paste", "white miso", "gochujang", "gochujang paste", "harissa", "harissa paste", "brown sugar", "dark brown sugar",
  "sesame oil", "toasted sesame oil", "green onions", "scallions", "chicken breast", "boneless skinless chicken breasts", "wonton wrappers", "wonton wrapper", "fish sauce",
  "ginger", "fresh ginger", "garlic cloves", "garlic powder", "chicken stock", "chicken", "bell pepper", "pepper", "red wine", "red onion", "yellow onion", "onion",
  "vinaigre de riz", "vinaigre de vin de riz", "vinaigre de riz assaisonné", "vinaigre de cidre", "vinaigre de cidre de pomme", "vinaigre rouge", "vinaigre de vin rouge",
  "vinaigre de vin blanc", "vinaigre de vin", "vinaigre balsamique", "moutarde de Dijon", "sauce soya faible en sodium", "sauce soya réduite en sodium", "sauce soya à teneur réduite en sodium",
  "lait faible en gras", "lait réduit en gras", "lait sans gras", "miel liquide", "bulbe de fenouil", "tête d'ail", "gousses d'ail", "coriandre", "coriandre fraîche",
  "feuilles de coriandre", "coriandre moulue", "graines de coriandre", "feuilles de lime", "feuilles de limette", "feuilles de bananier", "feuilles de vigne", "feuilles de cari",
  "jus de lime", "jus de citron", "zeste de citron", "zeste de lime", "zeste d'orange", "jus d'orange", "citron", "lime", "orange", "sauce sriracha", "sauce hoisin",
  "vinaigre blanc", "vinaigre", "sel assaisonné", "sauce de poisson", "vinaigre de cidre de pommes", "oignons verts", "poitrine de poulet", "huile de sésame", "huile de sésame grillé",
  "crème 35", "banane", "oignon rouge", "coriandre fraîche", "jaune d'œuf", "blanc d'œuf", "œuf", "œufs", "egg yolk", "egg white", "egg yolks", "egg whites", "eggs", "egg",
  // Names that join two foods if a rule is too wide: a meat made into something else, a variety, a ripe fruit.
  "saucisse italienne", "saucisses italiennes", "jambon", "pork sausage", "chicken sausage", "turkey bacon", "turkey ham", "bacon grease", "bacon bits", "pork chop", "pork", "porc",
  "côtelette de porc", "canard", "duck fat", "crevette", "shrimp salad", "chicken salad", "chicken liver", "chicken soup", "chicken nuggets", "pork rinds", "beef gravy", "corned beef",
  "lamb kidney", "beef tomatoes", "oyster mushrooms", "chili con carne", "chilli bean paste", "thai chilli jam", "pâte de piment fort", "chilli flakes", "chile pepper",
  "tomate roma", "roma tomatoes", "plum tomato", "tomate cerise", "tomate raisin", "fromage de chèvre", "goat", "goat cheese",
  "mûres", "mûre", "cerise mûre", "cerises mûres", "prune mûre", "tomate mûre", "banane mûre", "bananes mûres", "confiture de mûres", "tarte aux mûres", "ripe cherries", "ripe bananas", "blackberry jam",
  "ripe banana", "bananes", "ripe tomatoes", "tomates mûres", "ripe avocados", "avocat mûr", "avocats mûrs", "ripe mango", "mangue mûre", "ripe blackberries",
  // Dried and smoked foods are their own foods, in both languages (herbs, spices and foods sold dry keep their plain name).
  "apricots", "abricots", "dried apricots", "dehydrated apricots", "abricots séchés", "abricots déshydratés", "dried shrimp", "crevettes séchées", "shrimp",
  "salmon", "saumon", "smoked salmon", "saumon fumé", "cold smoked salmon", "hickory-smoked bacon", "smoked bacon", "smoked ham", "jambon fumé", "ham", "smoked sausage", "saucisse fumée",
  "tomatoes", "tomates", "dried tomatoes", "sun-dried tomatoes", "sun dried tomatoes", "tomates séchées", "tomates séchées au soleil", "tomates déshydratées", "dehydrated tomatoes",
  "strawberries", "fraises", "freeze-dried strawberries", "fraises lyophilisées", "mushrooms", "champignons", "dried mushrooms", "champignons séchés",
  "mango", "mangue", "dried mango", "mangue séchée", "cranberries", "canneberges", "dried cranberries", "canneberges séchées",
  "oregano", "origan", "dried oregano", "origan séché", "basil", "dried basil", "basilic séché", "parsley", "dried parsley", "persil séché", "thyme", "dried thyme", "thym séché",
  "dried chili flakes", "flocons de piment séchés", "paprika", "smoked paprika", "paprika fumé", "cilantro", "dried cilantro", "coriandre séchée",
  "spaghetti", "dried spaghetti", "pasta", "dried pasta", "pâtes séchées", "lentils", "dried lentils", "lentilles", "lentilles séchées",
  "chickpeas", "dried chickpeas", "pois chiches", "pois chiches séchés", "dried white beans", "tofu", "smoked tofu", "tofu fumé",
  "cooked chicken", "poulet cuit", "chicken", "poulet", "cooked rice", "riz cuit", "rice", "riz",
  // Mustard powder, written every way, and the prepared mustards it is not.
  "mustard", "moutarde", "dried mustard", "dry mustard", "ground mustard", "dried ground mustard", "mustard powder", "dry mustard powder", "powdered mustard",
  "moutarde sèche", "moutarde séchée", "moutarde en poudre", "moutarde moulue", "poudre de moutarde", "yellow mustard", "moutarde jaune", "honey mustard",
  "English mustard", "mustard seeds", "graines de moutarde",
];

// Words that describe or prepare a food and are never a food: as a name on their own
// they match nothing (they used to match only themselves), so they are not in the list.
const NOT_FOODS = new Set(["bulb", "bulbe", "feuille", "feuilles", "zeste", "liquid", "liquide", "full fat", "biologique", "biologiques", "organic"]);

function names() {
  const out = new Set();
  const add = (n) => {
    const s = String(n || "").replace(/\s+/g, " ").trim();
    // "pxpie" is bilingual.js's own marker for a pâté, not a name anyone has.
    if (s.length >= 2 && s.length <= 60 && !NOT_FOODS.has(s.toLowerCase()) && !/^pxpie/i.test(s)) out.add(s);
  };
  // TheMealDB's ingredient list.
  const mealdb = read("client/src/lib/mealdbIngredients.js").match(/`([^`]+)`/)[1];
  mealdb.split("|").forEach(add);
  // FoodKeeper's products and keywords.
  for (const p of JSON.parse(read("server/data/foodkeeper.json"))) {
    add(p.name.replace(/\([^)]*\)/g, " "));
    (p.keywords || []).forEach(add);
  }
  // Every spelling of the ingredient names table, in both languages, singular and plural, as it is
  // written, in lower case and typed without accents (« creme sure »).
  const table = parseTable(read("client/src/lib/ingredientDisplay.txt"));
  const addTyped = (form) => {
    add(form);
    add(form.toLowerCase());
    add(fold(form));
  };
  for (const row of builtInRowsOf(table)) {
    for (const lang of ["en", "fr"]) for (const number of ["one", "other"]) row[lang][number].forEach(addTyped);
  }
  // The matcher's own French words, and the flyers' word pairs.
  for (const file of ["client/src/lib/matcherWords.js", "client/src/lib/bilingual.js"]) {
    for (const m of read(file).matchAll(/\["([^"]+)", "([^"]+)"\]/g)) {
      add(m[1]);
      add(m[2]);
    }
  }
  // The matcher's own tables of names, and the names the tests and the browser tests use.
  const files = [
    ...readdirSync(join(root, "client/src/lib")).filter((f) => /^(inventoryMatch|oneMatcher|groceryAtHome|recipeCard|ingredientMatch|groceryList)\.test\.js$/.test(f)).map((f) => `client/src/lib/${f}`),
    ...readdirSync(join(root, "e2e")).filter((f) => f.endsWith(".js")).map((f) => `e2e/${f}`),
  ];
  for (const f of files) {
    const text = read(f);
    for (const m of text.matchAll(/\bname:\s*"([^"\n]{2,50})"/g)) add(m[1]);
    for (const m of text.matchAll(/^\s*\["([^"\n]+)", "([^"\n]+)"\],?$/gm)) {
      add(m[1]);
      add(m[2]);
    }
    for (const m of text.matchAll(/^\s*"?([A-Za-z -]+)"?: \[((?:"[^"\n]+",? ?)+)\],?$/gm)) {
      add(m[1]);
      for (const v of m[2].matchAll(/"([^"\n]+)"/g)) add(v[1]);
    }
  }
  EXTRA.forEach(add);
  return [...out].sort((a, b) => a.localeCompare(b));
}

const mode = process.argv[2];
if (mode === "names") {
  const list = names();
  writeFileSync(join(fixtures, "inventoryMatchNames.json"), JSON.stringify(list));
  console.log(`${list.length} names`);
} else if (mode === "matches") {
  const { itemCovers } = await import(process.argv[4] || join(root, "client/src/lib/inventoryMatch.js"));
  const list = JSON.parse(readFileSync(join(fixtures, "inventoryMatchNames.json"), "utf8"));
  const rows = list.map((have) => {
    const covered = [];
    list.forEach((ingredient, j) => {
      if (itemCovers(have, ingredient)) covered.push(j);
    });
    return covered;
  });
  const file = process.argv[3] || join(fixtures, "inventoryMatchBaseline.json");
  writeFileSync(file, JSON.stringify(rows));
  console.log(`${rows.reduce((n, r) => n + r.length, 0)} matches among ${list.length} names -> ${file}`);
} else {
  console.error("usage: node scripts/inventoryMatchWide.mjs names | matches [file]");
  process.exit(1);
}

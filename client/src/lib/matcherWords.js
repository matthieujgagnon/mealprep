// The French words the Inventory matcher (inventoryMatch.js) reads on its own, because its rules
// need them in English. Plain data with no imports, so the server can refuse a name that uses one
// (lib/ingredientTable.js `clashOf`) with the same list the matcher reads.
//
// These are NOT ingredient names: the names are the table (ingredientDisplay.txt) and Matt's
// changes to it, which feed the matcher too (lib/frenchReading.js). What is here is the matcher's
// grammar: how a food is sold or made (« haché », « bouillon », « zeste »), the cuts of a meat
// (« poitrine », « cuisse ») and tap water. A word in the table's own "describing words" section is
// read from there, so it is not repeated here.
//
// Every French spelling is written as lib/ingredientTable.js `keyOf` writes it: lower case, no
// accents, apostrophes and hyphens as spaces. A test holds the list to that.

export const RULE_WORDS_FR = [
  // How a food is sold, kept or cooked.
  ["sans sel", "unsalted"], ["demi sel", "salted"], ["au gout", "to taste"],
  ["tranche", "sliced"], ["tranches", "sliced"], ["tranchees", "sliced"],
  ["simili", "mock"], ["chaud", "hot"], ["cuisinees", "cooked"], ["cuisines", "cooked"],
  ["pane", "breaded"], ["panes", "breaded"], ["panee", "breaded"], ["panees", "breaded"],
  ["assaisonne", "seasoned"], ["assaisonnee", "seasoned"], ["assaisonnes", "seasoned"], ["assaisonnees", "seasoned"],
  ["marine", "marinated"], ["marines", "marinated"], ["marinees", "marinated"],
  ["a bouillir", "boiling"], ["condense", "condensed"], ["evapore", "evaporated"],
  ["croustillant", "crispy"], ["croustillants", "crispy"],
  // Dried, as « séché » is (the table's describing word): the matcher keeps "dried" apart from the plain food.
  ["deshydrate", "dried"], ["deshydratee", "dried"], ["deshydrates", "dried"], ["deshydratees", "dried"],
  ["lyophilise", "dried"], ["lyophilisee", "dried"], ["lyophilises", "dried"], ["lyophilisees", "dried"],
  ["mi maigre", "medium"], ["extra maigre", "extra lean"],
  ["hache", "ground"], ["hachee", "ground"], ["haches", "ground"],
  ["grec", "greek"], ["grecque", "greek"], ["balsamique", "balsamic"], ["all purpose", "all-purpose"],
  // What a food was made into, and the parts of a plant (the matcher never takes these for the food).
  ["bouillon", "stock"], ["poudre", "powder"], ["concentre", "paste"], ["puree", "puree"],
  ["feuille", "leaf"], ["feuilles", "leaves"], ["zeste", "zest"], ["cidre", "cider"], ["bulbe", "bulb"],
  ["bananier", "banana"], ["vigne", "vine"], ["cari", "curry"],
  // Water from the tap.
  ["eau froide", "cold water"], ["eau chaude", "hot water"], ["eau tiede", "warm water"], ["eau bouillante", "boiling water"],
  // Cuts of meat and fish, and the words flyers and receipts put on them.
  ["hauts de cuisses", "thighs"], ["hauts de cuisse", "thighs"], ["haut de cuisse", "thigh"],
  ["poitrines", "breasts"], ["poitrine", "breast"], ["cuisses", "legs"], ["cuisse", "leg"],
  ["pilons", "drumsticks"], ["ailes", "wings"], ["ailles", "wings"], ["aile", "wing"],
  ["filets", "fillets"], ["filet", "fillet"], ["lanieres", "strips"], ["escalopes", "cutlets"], ["escalope", "cutlet"],
  ["brochettes", "skewers"], ["cotelettes", "chops"], ["longe", "loin"], ["darnes", "steaks"], ["darne", "steak"],
  ["emince", "shaved"], ["eminces", "shaved"], ["cotes levees", "ribs"], ["cotes", "ribs"],
  ["surlonge", "sirloin"], ["bas de palette", "blade"], ["palette", "blade"], ["gigot", "leg"],
  ["jarrets", "shanks"], ["jarret", "shank"], ["flanc", "belly"], ["cubes", "cubes"],
  ["viandes", "meats"], ["viande", "meat"], ["charcuteries", "deli meats"], ["charcuterie", "deli meats"],
  // On a flyer « pâté » is a pie; « pâte » is dough in a recipe. Folding the accent loses the
  // difference, so the bare word stays a pie as it always was, and « pâte pour » is dough.
  ["pate", "pie"], ["pate pour", "dough"],
];

// Words that mean one thing here and another in the other language, where the matcher keeps the
// reading it always had: « raisins » is grapes (the table does not read it at all, because "raisins"
// is dried grapes in English), and « rôti » is a roast (the table's describing word « rôti » is
// "roasted").
export const EXCEPTIONS_FR = [
  ["roti", "roast"],
  ["raisins", "grapes"],
];

// French spellings the table has that the matcher never reads, because they are ordinary English
// words too: « salé » ("sale"), and « thé » ("the", which is never tea here).
export const NOT_READ_FR = ["sale", "sales", "the"];

// The spellings a change to the table may not use: they would take over a word the matcher reads
// for its own rules. English meaning by key, for the message that says so.
export const RULE_WORD_MEANING = new Map(RULE_WORDS_FR.map(([fr, en]) => [fr, en]));

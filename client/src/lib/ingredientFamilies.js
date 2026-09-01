// Broader ingredient "family" grouping, layered on top of groceryList's
// canonicalize() core.
//
// This is intentionally used ONLY for reuse/similarity signals — the
// planner sidebar's overlap score, "similar recipes", and "use this up"
// perishable nudges (see similarRecipes.js). It is NOT used by the grocery
// list itself: canonicalize() there stays literal, because "chicken thighs"
// and "chicken breast" are genuinely different things to put in a cart, even
// though planning-wise they're both "you're already buying chicken this
// week." If you want the grocery list to merge them too, that's a one-line
// change in groceryList.js — just say the word.

// If any of these words appears anywhere in a canonical core, that word
// *is* the family — covers every cut/prep variant in one shot ("chicken
// thigh", "boneless skinless chicken breast", "ground chicken" all contain
// "chicken").
const FAMILY_WORDS = new Set([
  "chicken", "beef", "pork", "turkey", "lamb", "duck", "veal",
  "shrimp", "salmon", "tuna", "cod", "tilapia", "halibut", "scallop",
  "tofu", "tempeh",
]);

// Cuts/products that are a genuine synonym for a protein but don't contain
// that protein's word at all ("flank steak" has no "beef" in it).
const CUT_TO_FAMILY = {
  "flank steak": "beef", "skirt steak": "beef", "ribeye": "beef",
  "rib eye": "beef", "sirloin": "beef", "chuck roast": "beef",
  "brisket": "beef", "short rib": "beef", "short ribs": "beef",
  "prime rib": "beef", "new york strip": "beef", "strip steak": "beef",
  "tri tip": "beef",
  "bacon": "pork", "ham": "pork", "prosciutto": "pork", "pancetta": "pork",
  "sausage": "pork", "chorizo": "pork", "italian sausage": "pork",
  "prawn": "shrimp", "prawns": "shrimp", "langoustine": "shrimp",
};

// True synonyms — different words for the same ingredient — normalized to
// one canonical word before family lookup. (Herb/produce variants like
// "fresh cilantro" or "cilantro sprigs" already collapse via PREP_WORDS in
// groceryList.js, so they don't need an entry here.)
const SYNONYM_WORDS = {
  scallion: "green onion", scallions: "green onion",
  "spring onion": "green onion", "spring onions": "green onion",
  capsicum: "bell pepper",
  aubergine: "eggplant",
  courgette: "zucchini",
  garbanzo: "chickpea", "garbanzo bean": "chickpea", "garbanzo beans": "chickpea",
  spud: "potato", spuds: "potato",
  chili: "chile", chilli: "chile", chilies: "chile", chillies: "chile",
};

// Given a canonicalize()-produced core string, returns the broader family
// key to use for reuse/similarity matching. Falls back to the core itself
// when nothing more specific is known, so unmapped ingredients still match
// each other on exact name as they did before.
export function familyKey(core) {
  if (!core) return core;

  if (CUT_TO_FAMILY[core]) return CUT_TO_FAMILY[core];
  if (SYNONYM_WORDS[core]) return SYNONYM_WORDS[core];

  const words = core.split(" ");
  for (const w of words) {
    if (FAMILY_WORDS.has(w)) return w;
  }
  for (const w of words) {
    if (SYNONYM_WORDS[w]) return SYNONYM_WORDS[w];
  }

  return core;
}

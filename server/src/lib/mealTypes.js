import { looksLikeReadyMeal } from "./dealAisle.js";

// A recipe can be several meal types at once (Chow Mein is a supper and a lunch) and can be
// « Plat préparé » (croissants: a breakfast AND nothing to cook). Recipe.mealSlots is the list;
// the old single Recipe.mealSlot stays as the first of it (nothing was dropped), and is not read.
// client/src/lib/mealSlots.js is the browser's side of the same ids and rules.
export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "side", "snack", "dessert", "prep"];

// What a request says about the types. `mealSlots` is the list; the old `mealSlot` (one id)
// still works for anything that sends it. Returns { ok: true, value } where value is the list in
// the usual order without repeats, or undefined when the request does not say (leave as it is);
// { ok: false, key } when it names an unknown type, or is an empty list (a recipe that is
// saved has at least one type; one that is not sorted yet is just never given any).
export function readMealTypes(body = {}) {
  const given = body.mealSlots !== undefined ? body.mealSlots : body.mealSlot === undefined || body.mealSlot === null || body.mealSlot === "" ? undefined : [body.mealSlot];
  if (given === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(given) || !given.every((id) => typeof id === "string" && MEAL_SLOTS.includes(id))) return { ok: false, key: "mustBeOneOf" };
  if (given.length === 0) return { ok: false, key: "mealTypeRequired" };
  return { ok: true, value: MEAL_SLOTS.filter((id) => given.includes(id)) };
}

// `isPrepared` is a yes or no; anything else is refused. undefined = leave as it is.
export function readPrepared(value) {
  if (value === undefined) return { ok: true, value: undefined };
  return typeof value === "boolean" ? { ok: true, value } : { ok: false };
}

// ---- Suggestions (rules only, no AI) ------------------------------------------------------
//
// For the "sort your recipes" screen and the editor: what a recipe's title and ingredients
// suggest. It only suggests: nothing is typed or tagged until the person says so. When the
// rules cannot decide the list is empty and the person picks.

// Lower case, no accents, plain letters: « Pâté chinois » and "pate chinois" are the same.
function fold(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9% ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const words = (list) => new RegExp(`(?<![a-z])(?:${list})(?![a-z])`);

const DESSERT = words("cakes?|gateaux?|cookies?|brownies?|puddings?|poudings?|pouding|ice cream|creme glacee|cheesecakes?|mousse|fudge|cupcakes?|desserts?|tiramisu|macarons?|creme brulee|truffles?|sorbets?|gelato|crumble|donuts?|doughnuts?|beignes?|sundaes?|tartes? (?:aux?|a la|au|sucre)|(?:apple|pumpkin|pecan|lemon|cherry|peach|blueberry|strawberry|key lime|sugar|cream) pie");
const BREAKFAST_LUNCH = words("omelet(?:te)?s?|omelettes?|frittatas?|quiches?|shakshuka|brunch");
const BREAKFAST = words("pancakes?|crepes?|waffles?|gaufres?|oatmeal|porridge|gruau|granola|french toast|pain dore|scrambled|eggs? benedict|breakfast|dejeuner|muffins?|smoothies?|parfaits?|overnight oats|avocado toast|toasts?|hash browns?|rosti|bagels?|croissants?|chocolatines?|pains? au chocolat|cereals?|cereales?|brioches?");
const SNACK = words("hummus|houmous|dips?|trempettes?|guacamole|energy balls?|energy bites?|trail mix|popcorn|chips|croustilles|granola bars?|barres?|bites|collations?|snacks?|deviled eggs|oeufs mimosa|nachos?");
// Words that make a recipe a prep no matter where they sit (pickled shallots), and words that
// only do when the title is short and not "chicken with mushroom sauce".
const PREP_STRONG = words("pickled?|pickles?|pickling|cornichons?|marinades?|vinaigrettes?|dressings?|rubs?|spice (?:mix|blend)|melanges? d epices|jams?|confitures?|chutneys?|relish|condiments?");
const PREP_WEAK = words("sauces?|stocks?|broths?|bouillons?|salsas?|pestos?|compotes?|syrups?|sirops?|ketchup|mayo|mayonnaise|seasonings?");
const MEAL_IN_ONE = words("soups?|soupes?|sandwich(?:es)?|wraps?|burgers?|bowls?|bols?|salads?|salades?");
const SIDE = words("mashed potatoes?|puree|coleslaw|salade de chou|slaw|garlic bread|pain a l ail|roasted|grilled|steamed|sauteed|glazed|rice|riz|couscous|quinoa|fries|frites|salads?|salades?|asparagus|asperges|green beans|haricots verts|corn on the cob");
const MAIN = words(
  "chicken|poulet|beef|boeuf|pork|porc|fish|poisson|salmon|saumon|shrimps?|crevettes?|tofu|sausages?|saucisses?|lamb|agneau|turkey|dinde|steaks?|ribs?|bacon|ham|jambon|pasta|pates|spaghetti|macaroni|lasagn[ae]|curry|chili|stew|ragout|casserole|stir fry|tacos?|pizza|risotto|noodles?|nouilles|chow mein|lo mein|meatballs?|boulettes|roast|roti|tourtiere|pate chinois|pot pie|enchiladas?|fajitas?|biryani|dal|dhal|lentils?|lentilles|chickpeas?|pois chiches|beans|haricots|gyros?|kebabs?|shawarma|falafel|ground beef|boeuf hache|burritos?|quesadillas?|sandwich(?:es)?|wraps?|burgers?|bowls?|bols?"
);

const FROZEN = words("frozen|surgele|surgelee|surgeles|surgelees");
// Bought ready, nothing to cook: a bakery item, whatever else the recipe says.
const PREPARED_NAME = words("croissants?|chocolatines?|pains? au chocolat|bagels?|brioches?|viennoiseries?|danish(?:es)?");

function titleWords(title) {
  return title ? title.split(" ").length : 0;
}

// The meal types a recipe suggests, in the usual order. [] when the rules cannot decide.
export function suggestMealSlots({ title, ingredients = [] } = {}) {
  const name = fold(title);
  const lines = ingredients.map((ing) => fold(typeof ing === "string" ? ing : ing?.name)).filter(Boolean);
  const text = [name, ...lines].join(" | ");
  const short = titleWords(name) <= 4;
  const pick = (...ids) => MEAL_SLOTS.filter((id) => ids.includes(id));

  if (DESSERT.test(name)) return pick("dessert");
  if (BREAKFAST_LUNCH.test(name)) return pick("breakfast", "lunch");
  if (BREAKFAST.test(name)) return pick("breakfast");
  if (SNACK.test(name)) return pick("snack");
  if (PREP_STRONG.test(name)) return pick("prep");
  if (PREP_WEAK.test(name) && short && !/(?<![a-z])(?:with|avec|aux|au)(?![a-z])/.test(name) && !MAIN.test(name)) return pick("prep");
  if (MEAL_IN_ONE.test(name)) return pick("lunch", "dinner");
  if (SIDE.test(name) && short && !MAIN.test(text)) return pick("side");
  if (MAIN.test(text) || lines.length >= 5) return pick("dinner");
  return [];
}

// Whether a recipe looks like something that is bought ready and not cooked: it has a single
// ingredient (« chocolatine »), its name is a bakery item (croissant, bagel), or it is a ready
// meal by name (frozen lasagna, « pizza surgelée »; a bare « lasagne » with a real ingredient list
// is a recipe, so a ready-meal name alone is only enough with one or two ingredients).
export function suggestPrepared({ title, ingredients = [] } = {}) {
  const name = fold(title);
  const count = ingredients.map((ing) => fold(typeof ing === "string" ? ing : ing?.name)).filter(Boolean).length;
  if (count === 1) return true;
  if (PREPARED_NAME.test(name)) return true;
  const ready = looksLikeReadyMeal(title);
  if (ready && FROZEN.test(name)) return true;
  return ready && count > 0 && count <= 2;
}

export function suggestForRecipe(recipe) {
  return { slots: suggestMealSlots(recipe), prepared: suggestPrepared(recipe) };
}

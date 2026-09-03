import { canonicalize, capitalize, STAPLE_WORDS, SPICE_WORDS } from "./groceryList.js";
import { familyKey } from "./ingredientFamilies.js";

// Perishable ingredients that typically go bad within a week if bought fresh.
// Used to flag "use it up" nudges on the planner and grocery list.
const PERISHABLES = new Set([
  "avocado", "cilantro", "parsley", "basil", "mint", "dill", "chive", "chives",
  "green onion", "green onions", "scallion", "scallions", "spinach", "arugula",
  "lettuce", "kale", "mango", "strawberry", "strawberries", "raspberry", "raspberries",
  "blueberry", "blueberries", "cherry", "cherries", "grape", "grapes", "peach", "peaches",
  "plum", "plums", "banana", "bananas", "pineapple", "melon", "watermelon",
  "zucchini", "cucumber", "bell pepper", "tomato", "tomatoes", "mushroom", "mushrooms",
  "asparagus", "broccoli", "cauliflower", "cabbage", "eggplant", "corn",
  "lemon", "lime", "orange", "ginger", "fresh ginger", "jalapeño", "jalapeno",
  "fish", "shrimp", "salmon", "tuna", "halibut", "cod", "tilapia", "scallop", "scallops",
  "chicken", "ground beef", "beef", "pork", "lamb", "turkey", "bacon", "sausage",
  "prosciutto", "deli ham", "tofu",
  "cream", "heavy cream", "sour cream", "greek yogurt", "yogurt", "milk", "buttermilk",
  "feta", "brie", "ricotta", "cottage cheese", "cream cheese", "mozzarella", "goat cheese",
  "egg", "eggs",
  // Onions and shallots: not as fast-spoiling as herbs, but cut/prepped
  // portions do go bad within a week in the fridge, and every color variant
  // is a distinct core from plain "onion" (canonicalize doesn't strip the
  // color), so each needs its own entry.
  "onion", "onions", "red onion", "red onions", "yellow onion", "yellow onions",
  "white onion", "white onions", "shallot", "shallots",
  // Prepared dips/sauces built on perishable bases (yogurt, avocado) that
  // spoil at the same pace as their main ingredient, even though the
  // ingredient line itself doesn't literally say "yogurt" or "avocado".
  "tzatziki", "hummus", "guacamole", "pesto",
]);

// Get the reuse-matching key for an ingredient name: canonicalize() for
// prep-word/unit stripping, then familyKey() to collapse cuts and synonyms
// ("chicken thigh" / "chicken breast" / "ground chicken" -> "chicken") so
// reuse detection isn't fooled by which cut a recipe happens to call for.
//
// Staples (salt, pepper, oil, and most other spices — the same list the
// grocery list uses) are excluded entirely, returning null. Virtually every
// recipe calls for salt, so counting it as a "shared ingredient" was pure
// noise — two completely unrelated recipes would show up as "matching"
// over nothing more than both using salt and pepper. Every caller below
// already drops falsy cores, so this one change clears staples out
// everywhere at once.
const STAPLES_SET = new Set([...STAPLE_WORDS, ...SPICE_WORDS]);

function core(ingredientName) {
  const c = familyKey(canonicalize(ingredientName).core);
  return STAPLES_SET.has(c) ? null : c;
}

// Not every shared ingredient is equally worth surfacing. A shared
// perishable (chicken, avocado, cilantro) means using it up before it
// spoils — the actual point of "plan around this" — so it's weighted
// higher than a shared shelf-stable item like canned beans or flour, which
// don't create any real urgency or waste risk either way.
function ingredientWeight(coreName) {
  return PERISHABLES.has(coreName) ? 2 : 1;
}

// Get the set of canonical ingredient cores for a recipe
function recipeCores(recipe) {
  return new Set(
    (recipe.ingredients || []).map((i) => core(i.name)).filter(Boolean)
  );
}

// Get the union of canonical ingredient cores across several recipes.
function unionCores(recipes) {
  const result = new Set();
  for (const r of recipes) {
    for (const c of recipeCores(r)) result.add(c);
  }
  return result;
}

// Returns up to `limit` other recipes ranked by how *useful* their overlap
// with `anchorRecipes` is — not just how many ingredients they share. A
// recipe sharing one perishable protein outranks one sharing two pantry
// basics, since reusing the protein before it spoils is the actual value
// here. Accepts either a single recipe or an array of recipes to plan
// around several things — e.g. "I have chicken thighs AND a bunch of
// avocados" — at once; the match is against the combined ingredient set.
export function findSimilarRecipes(anchorRecipes, allRecipes, limit = 8) {
  const anchors = Array.isArray(anchorRecipes) ? anchorRecipes : [anchorRecipes];
  const anchorIds = new Set(anchors.map((r) => r.id));
  const targetCores = unionCores(anchors);
  if (targetCores.size === 0) return [];

  return allRecipes
    .filter((r) => !anchorIds.has(r.id) && !r.isPlaceholder)
    .map((r) => {
      const cores = recipeCores(r);
      const sharedCores = [...cores].filter((c) => targetCores.has(c));
      const score = sharedCores.reduce((sum, c) => sum + ingredientWeight(c), 0);
      return {
        recipe: r,
        sharedCount: sharedCores.length,
        score,
        // Clean canonical name ("Red onion"), not the raw prep-annotated
        // ingredient text ("Red onions, thinly sliced") — this is a display
        // list, not a shopping line, so the prep detail is just noise here.
        sharedIngredients: sharedCores.map((c) => capitalize(c)),
      };
    })
    .filter((m) => m.sharedCount > 0)
    .sort((a, b) => b.score - a.score || b.sharedCount - a.sharedCount)
    .slice(0, limit);
}

// Computes ingredient overlap stats across the whole planned week.
// Returns:
//   totalUnique     - number of distinct ingredients across all meals
//   totalWithDups   - total if counted per-meal (no merging)
//   savedItems      - how many shopping trips you're saving by reusing
//   sharedIngredients - Map of core name -> array of recipe objects using it
//   overlapScore    - 0-100, how well-optimized the week is for reuse
export function computeWeekOverlap(plannerEntries, allRecipes) {
  const recipeMap = new Map(allRecipes.map((r) => [r.id, r]));
  const ingredientToRecipes = new Map(); // core -> Map<recipeId, recipe>
  let totalWithDups = 0;

  for (const entry of plannerEntries) {
    if (entry.isLeftover) continue;
    const recipe = recipeMap.get(entry.recipeId) || entry.recipe;
    if (!recipe || recipe.isPlaceholder) continue;

    for (const ing of recipe.ingredients || []) {
      const c = core(ing.name);
      if (!c) continue;
      totalWithDups++;
      if (!ingredientToRecipes.has(c)) ingredientToRecipes.set(c, new Map());
      ingredientToRecipes.get(c).set(recipe.id, recipe);
    }
  }

  const totalUnique = ingredientToRecipes.size;
  const savedItems = totalWithDups - totalUnique;

  // Shared ingredients: only those used in 2+ recipes. Keeps full recipe
  // objects (not just titles) so the UI can act on them directly — open a
  // recipe, or drag one straight onto an empty planner slot — instead of
  // just displaying a name.
  const shared = new Map(
    [...ingredientToRecipes.entries()]
      .filter(([, recipes]) => recipes.size > 1)
      .map(([c, recipes]) => [c, [...recipes.values()]])
  );

  const overlapScore =
    totalWithDups > 0 ? Math.round((savedItems / totalWithDups) * 100) : 0;

  return { totalUnique, totalWithDups, savedItems, sharedIngredients: shared, overlapScore };
}

// Given everything already planned this week, ranks NOT-yet-planned recipes
// by how much they'd add to this week's ingredient reuse — i.e. "what's the
// single best thing to add to an empty slot." This is computeWeekOverlap's
// natural complement: that function reports on the week after the fact,
// this one recommends what to do next.
export function suggestNextRecipes(plannerEntries, allRecipes, limit = 5) {
  const recipeMap = new Map(allRecipes.map((r) => [r.id, r]));
  const plannedIds = new Set();
  const weekCores = new Set();

  for (const entry of plannerEntries) {
    if (entry.isLeftover) continue;
    const recipe = recipeMap.get(entry.recipeId) || entry.recipe;
    if (!recipe || recipe.isPlaceholder) continue;
    plannedIds.add(recipe.id);
    for (const c of recipeCores(recipe)) weekCores.add(c);
  }

  if (weekCores.size === 0) return [];

  return allRecipes
    .filter((r) => !plannedIds.has(r.id) && !r.isPlaceholder)
    .map((r) => {
      const cores = recipeCores(r);
      const sharedCores = [...cores].filter((c) => weekCores.has(c));
      const score = sharedCores.reduce((sum, c) => sum + ingredientWeight(c), 0);
      return {
        recipe: r,
        sharedCount: sharedCores.length,
        score,
        sharedIngredients: sharedCores.map((c) => capitalize(c)),
      };
    })
    .filter((m) => m.sharedCount > 0)
    .sort((a, b) => b.score - a.score || b.sharedCount - a.sharedCount)
    .slice(0, limit);
}

// Given a list of ingredient names the user says they have on hand, ranks
// recipes by how close they are to fully makeable right now — fewest
// missing ingredients first. Staples (salt, oil, most spices) are assumed
// to always be on hand and never count as missing, the same way they're
// excluded from every other matching function here.
export function findRecipesByIngredients(haveNames, allRecipes, limit = 30) {
  const haveCores = new Set(haveNames.map((n) => core(n)).filter(Boolean));
  if (haveCores.size === 0) return [];

  return allRecipes
    .filter((r) => !r.isPlaceholder)
    .map((r) => {
      const cores = [...recipeCores(r)];
      if (cores.length === 0) return null;
      const matched = cores.filter((c) => haveCores.has(c));
      const missing = cores.filter((c) => !haveCores.has(c));
      return {
        recipe: r,
        matchedCount: matched.length,
        totalCount: cores.length,
        matchedIngredients: matched.map((c) => capitalize(c)),
        missingIngredients: missing.map((c) => capitalize(c)),
      };
    })
    .filter((m) => m && m.matchedCount > 0)
    .sort((a, b) => {
      if (a.missingIngredients.length !== b.missingIngredients.length) {
        return a.missingIngredients.length - b.missingIngredients.length;
      }
      return b.matchedCount - a.matchedCount;
    })
    .slice(0, limit);
}

// Perishable ingredients used somewhere in this week's plan that only ONE
// recipe calls for — i.e. likely to go to waste once that meal's made,
// since nothing else in the week uses the rest of it up. Powers the
// "add what's expiring" shortcut on the "what can I make" page.
export function findAtRiskPerishables(plannerEntries, allRecipes) {
  const recipeMap = new Map(allRecipes.map((r) => [r.id, r]));
  const ingredientToRecipes = new Map(); // core -> Set of recipe ids

  for (const entry of plannerEntries) {
    if (entry.isLeftover) continue;
    const recipe = recipeMap.get(entry.recipeId) || entry.recipe;
    if (!recipe || recipe.isPlaceholder) continue;
    for (const ing of recipe.ingredients || []) {
      const c = core(ing.name);
      if (!c || !PERISHABLES.has(c)) continue;
      if (!ingredientToRecipes.has(c)) ingredientToRecipes.set(c, new Set());
      ingredientToRecipes.get(c).add(recipe.id);
    }
  }

  return [...ingredientToRecipes.entries()]
    .filter(([, ids]) => ids.size === 1)
    .map(([c]) => capitalize(c));
}

// Returns perishable ingredients from a recipe's list that are NOT already
// covered by other planned meals this week — i.e. things you'll likely have
// leftover and should use up.
export function findUnusedPerishables(recipe, plannerEntries, allRecipes) {
  const recipeMap = new Map(allRecipes.map((r) => [r.id, r]));
  const recipeCoresSet = recipeCores(recipe);

  // Cores of this recipe that are perishable
  const perishableInRecipe = new Set(
    [...recipeCoresSet].filter((c) => PERISHABLES.has(c))
  );
  if (perishableInRecipe.size === 0) return [];

  // All ingredient cores planned elsewhere this week (excluding this recipe)
  const plannedElsewhere = new Set();
  for (const entry of plannerEntries) {
    if (entry.isLeftover) continue;
    const other = recipeMap.get(entry.recipeId) || entry.recipe;
    if (!other || other.id === recipe.id || other.isPlaceholder) continue;
    for (const ing of other.ingredients || []) {
      const c = core(ing.name);
      if (c) plannedElsewhere.add(c);
    }
  }

  // Perishables from this recipe NOT already used elsewhere this week
  return [...perishableInRecipe].filter((c) => !plannedElsewhere.has(c)).map(capitalize);
}

// True if an ingredient name is a perishable
export function isPerishable(ingredientName) {
  return PERISHABLES.has(core(ingredientName));
}

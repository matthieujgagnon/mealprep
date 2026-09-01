import { canonicalize } from "./groceryList.js";
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
  "chicken", "ground beef", "beef", "pork", "lamb", "turkey",
  "cream", "heavy cream", "sour cream", "greek yogurt", "yogurt", "milk",
  "feta", "brie", "ricotta", "cottage cheese", "cream cheese",
  "egg", "eggs",
]);

// Get the reuse-matching key for an ingredient name: canonicalize() for
// prep-word/unit stripping, then familyKey() to collapse cuts and synonyms
// ("chicken thigh" / "chicken breast" / "ground chicken" -> "chicken") so
// reuse detection isn't fooled by which cut a recipe happens to call for.
function core(ingredientName) {
  return familyKey(canonicalize(ingredientName).core);
}

// Get the set of canonical ingredient cores for a recipe
function recipeCores(recipe) {
  return new Set(
    (recipe.ingredients || []).map((i) => core(i.name)).filter(Boolean)
  );
}

// Returns up to `limit` other recipes ranked by how many ingredients they
// share with `recipe`. Used in the recipe popup and the planner sidebar.
export function findSimilarRecipes(recipe, allRecipes, limit = 8) {
  const targetCores = recipeCores(recipe);
  if (targetCores.size === 0) return [];

  return allRecipes
    .filter((r) => r.id !== recipe.id && !r.isPlaceholder)
    .map((r) => {
      const cores = recipeCores(r);
      const sharedCores = [...cores].filter((c) => targetCores.has(c));
      return {
        recipe: r,
        sharedCount: sharedCores.length,
        sharedIngredients: sharedCores.map((c) =>
          // Find original display name from the target recipe's ingredients
          recipe.ingredients.find((i) => core(i.name) === c)?.name || c
        ),
      };
    })
    .filter((m) => m.sharedCount > 0)
    .sort((a, b) => b.sharedCount - a.sharedCount)
    .slice(0, limit);
}

// Computes ingredient overlap stats across the whole planned week.
// Returns:
//   totalUnique     - number of distinct ingredients across all meals
//   totalWithDups   - total if counted per-meal (no merging)
//   savedItems      - how many shopping trips you're saving by reusing
//   sharedIngredients - Map of core name -> array of recipe titles that use it
//   overlapScore    - 0-100, how well-optimized the week is for reuse
export function computeWeekOverlap(plannerEntries, allRecipes) {
  const recipeMap = new Map(allRecipes.map((r) => [r.id, r]));
  const ingredientToRecipes = new Map(); // core -> Set of recipe titles
  let totalWithDups = 0;

  for (const entry of plannerEntries) {
    if (entry.isLeftover) continue;
    const recipe = recipeMap.get(entry.recipeId) || entry.recipe;
    if (!recipe || recipe.isPlaceholder) continue;

    for (const ing of recipe.ingredients || []) {
      const c = core(ing.name);
      if (!c) continue;
      totalWithDups++;
      if (!ingredientToRecipes.has(c)) ingredientToRecipes.set(c, new Set());
      ingredientToRecipes.get(c).add(recipe.title);
    }
  }

  const totalUnique = ingredientToRecipes.size;
  const savedItems = totalWithDups - totalUnique;

  // Shared ingredients: only those used in 2+ recipes
  const shared = new Map(
    [...ingredientToRecipes.entries()]
      .filter(([, recipes]) => recipes.size > 1)
      .map(([c, recipes]) => [c, [...recipes]])
  );

  const overlapScore =
    totalWithDups > 0 ? Math.round((savedItems / totalWithDups) * 100) : 0;

  return { totalUnique, totalWithDups, savedItems, sharedIngredients: shared, overlapScore };
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
  return [...perishableInRecipe]
    .filter((c) => !plannedElsewhere.has(c))
    .map((c) => recipe.ingredients.find((i) => core(i.name) === c)?.name || c);
}

// True if an ingredient name is a perishable
export function isPerishable(ingredientName) {
  return PERISHABLES.has(core(ingredientName));
}

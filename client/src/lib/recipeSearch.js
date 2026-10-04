// Matches on title, tags, and ingredient names - the fields the Planner's
// search checks too. Commas mean "any of": "parsley, spinach" (Home's Cook
// with these) finds recipes using either. Shared by Recipes and Makeable.
export function matchesSearch(recipe, query) {
  const terms = query
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (terms.length === 0) return true;
  return terms.some(
    (q) =>
      recipe.title?.toLowerCase().includes(q) ||
      recipe.tags?.some((t) => t.toLowerCase().includes(q)) ||
      recipe.ingredients?.some((i) => i.name?.toLowerCase().includes(q))
  );
}

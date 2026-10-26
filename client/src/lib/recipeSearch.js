import { ingredientOverridesVersion, ingredientSearchTerms } from "./ingredientDisplay.js";
import { keyOf } from "./ingredientTable.js";

// Matches on title, tags, and ingredient names - the fields the Planner's
// search checks too. Commas mean "any of": "parsley, spinach" (Home's Cook
// with these) finds recipes using either. Shared by Recipes and Makeable.
//
// A search finds either language through the ingredient names table (the built-in file with
// Matt's changes on top of it): « coriandre » finds a recipe with "fresh cilantro", and "cilantro"
// one with « coriandre fraîche » (`ingredientSearchTerms` gives every way a name can be written).
// Capitals, accents, apostrophes and hyphens do not matter: « epinards » finds « épinards » and
// "chou fleur" finds « chou-fleur ». A term is still looked for as written too, so half a word
// finds what it always did.

// Each recipe's searchable text, folded once and kept until the recipe itself is replaced (the
// app replaces a recipe when it is edited, so a changed title, tag or ingredient is read again).
// The fields are joined with a "|" a term can never hold, so a match never runs across two fields.
const texts = new WeakMap();

function textOf(recipe) {
  const kept = texts.get(recipe);
  if (kept && kept.title === recipe.title && kept.tags === recipe.tags && kept.ingredients === recipe.ingredients) return kept.text;
  const fields = [recipe.title, ...(recipe.tags || []), ...(recipe.ingredients || []).map((i) => i?.name)];
  const text = fields.map((field) => keyOf(field)).join("|");
  texts.set(recipe, { title: recipe.title, tags: recipe.tags, ingredients: recipe.ingredients, text });
  return text;
}

// The ways each comma-separated term of a query can be written, or null for no query. A search
// asks about every recipe with the same query, so the last answer is kept (until the names table
// changes).
let lastQuery = null;
let lastVersion = -1;
let lastTerms = null;

function searchVariants(query) {
  const text = String(query ?? "");
  const version = ingredientOverridesVersion();
  if (text !== lastQuery || version !== lastVersion) {
    const terms = text
      .split(",")
      .map((term) => ingredientSearchTerms(term))
      .filter((variants) => variants.length > 0);
    [lastQuery, lastVersion, lastTerms] = [text, version, terms.length > 0 ? terms : null];
  }
  return lastTerms;
}

export function matchesSearch(recipe, query) {
  const terms = searchVariants(query);
  if (!terms) return true;
  const text = textOf(recipe);
  return terms.some((variants) => variants.some((variant) => text.includes(variant)));
}

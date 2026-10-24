import { isKnownIngredient, isKnownNote } from "./ingredientDisplay.js";
import { fold, looksFrench } from "./bilingual.js";

// The admin's list of ingredients from the recipes that the names table has no line for yet
// (neither the built-in file ingredientDisplay.txt nor Matt's own changes, which the helper reads
// too). They are shown as written, so a French screen still has English in it until a name is
// given. The Admin page's Ingredient names card lists them, each a tap from the form that fills
// the other language in (components/IngredientNameForm.jsx); a name Matt gives leaves the list at
// once. The list is made from the recipes the app already holds; nothing is saved or sent anywhere.

// "Biryani Masala" and "biryani masala" are one name.
const sameName = (text) => fold(text).replace(/\s+/g, " ").trim();

function tally(map, key, written, recipeId) {
  const entry = map.get(key) || { name: written, recipes: new Set() };
  entry.recipes.add(recipeId);
  map.set(key, entry);
}

const byUse = (a, b) => b.recipes - a.recipes || a.name.localeCompare(b.name);
const finish = (map) => [...map.values()].map(({ name, recipes }) => ({ name, recipes: recipes.size })).sort(byUse);

// { names, notes, total }: the ingredient names (and the prep notes) the table does not
// know, most used first, each with how many recipes use it, and how many different
// names the recipes have in all.
export function ingredientGaps(recipes) {
  const names = new Map();
  const notes = new Map();
  const everyName = new Set();
  for (const recipe of recipes || []) {
    for (const ingredient of recipe.ingredients || []) {
      const name = String(ingredient.name || "").trim();
      if (!name) continue;
      everyName.add(sameName(name));
      if (!isKnownIngredient(name)) tally(names, sameName(name), name, recipe.id);
      const note = String(ingredient.notes || "").trim();
      if (note && !isKnownNote(note)) tally(notes, sameName(note), note, recipe.id);
    }
  }
  return { names: finish(names), notes: finish(notes), total: everyName.size };
}

// The list as lines of the names table, ready to fill in and paste into ingredientDisplay.txt:
// the side a name is written in is already there, the other side is empty. The "#" part is a
// comment the table ignores. The Admin card now uses it only for the prep notes, which are still
// added in the file (a name is filled in on the card itself).
export function gapLines({ names, notes }) {
  const uses = (n) => `# ${n} recipe${n === 1 ? "" : "s"}`;
  const out = [];
  if (names.length > 0) {
    out.push("# [ingredients]  English singular | English plural | French singular | French plural | gender (m or f)");
    for (const { name, recipes } of names) {
      out.push(looksFrench(name) ? ` |  | ${name} |  |  ${uses(recipes)}` : `${name} |  |  |  |  ${uses(recipes)}`);
    }
  }
  if (notes.length > 0) {
    if (out.length > 0) out.push("");
    out.push("# [prep words]  English | French m | French f | French m plural | French f plural");
    for (const { name, recipes } of notes) out.push(looksFrench(name) ? ` | ${name} |  |  |  ${uses(recipes)}` : `${name} |  |  |  |  ${uses(recipes)}`);
  }
  return out.join("\n");
}

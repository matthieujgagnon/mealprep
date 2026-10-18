// Every recipe the account has, loaded once and shared by every page, the way the flyer
// deals are (lib/dealsStore.js). Anything that adds, saves or deletes a recipe goes
// through the functions below, and every page that shows a recipe, or a planned meal of
// one, re-renders from here. Planned meals are read through `useLiveEntries`, never by
// their own copy of the recipe (lib/liveRecipes.js).
//
// A recipe deleted with Undo is `hide`n at once, which takes it and its meals off every
// page, and `show`n again by Undo. It stays hidden for good once the delete has gone
// through, so a page still holding an older read of the Planner cannot bring its meals back.
import { useMemo, useSyncExternalStore } from "react";
import { liveEntries } from "./liveRecipes.js";

const NONE = new Set();

function make(all, hidden) {
  const recipes = all.filter((r) => !hidden.has(r.id));
  return { all, hidden, recipes, byId: new Map(recipes.map((r) => [r.id, r])) };
}

let state = make([], NONE);
const subscribers = new Set();

function set(all, hidden = state.hidden) {
  state = make(all, hidden);
  for (const fn of subscribers) fn();
}

// What the store holds right now, for code that isn't a component:
// { recipes (not hidden), byId, hidden }.
export function recipeStoreState() {
  return state;
}

// The recipes as the server has them (the first load, or a retry). Whatever was hidden stays hidden.
export function loadRecipes(list) {
  set(list);
}

// A new or imported recipe, first in the list.
export function addRecipe(recipe) {
  set([recipe, ...state.all.filter((r) => r.id !== recipe.id)]);
}

// A recipe saved: what the server sent back replaces what the store had. A recipe the
// store has not got (deleted since) is not brought back.
export function saveRecipe(saved) {
  if (!state.all.some((r) => r.id === saved.id)) return;
  set(state.all.map((r) => (r.id === saved.id ? { ...r, ...saved } : r)));
}

// Delete's first step: the recipe and its meals leave every page. Undo calls `showRecipe`.
export function hideRecipe(id) {
  set(state.all, new Set(state.hidden).add(id));
}

export function showRecipe(id) {
  const hidden = new Set(state.hidden);
  hidden.delete(id);
  set(state.all, hidden);
}

// On logout: nothing of one account's recipes may show up for the next.
export function clearRecipes() {
  set([], NONE);
}

function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

// { recipes, byId, hidden }: re-renders when any recipe is added, saved, hidden or shown.
export function useRecipeStore() {
  return useSyncExternalStore(subscribe, recipeStoreState);
}

// Planned meals (from the Planner, upcoming meals, or a page's own read) as the store
// sees them: see lib/liveRecipes.js. Every page that reads meals from the server uses this.
export function useLiveEntries(entries) {
  const { byId, hidden } = useRecipeStore();
  return useMemo(() => liveEntries(entries, byId, hidden), [entries, byId, hidden]);
}

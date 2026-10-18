import { afterEach, describe, expect, it } from "vitest";
import { addRecipe, clearRecipes, hideRecipe, loadRecipes, recipeStoreState, saveRecipe, showRecipe } from "./recipeStore.js";
import { liveEntries } from "./liveRecipes.js";

const recipe = (id, extra = {}) => ({ id, title: `Recipe ${id}`, ...extra });
const ids = () => recipeStoreState().recipes.map((r) => r.id);

afterEach(() => clearRecipes());

describe("recipeStore", () => {
  it("loads, adds a new recipe first, and replaces one that is added again", () => {
    loadRecipes([recipe("a"), recipe("b")]);
    addRecipe(recipe("c"));
    expect(ids()).toEqual(["c", "a", "b"]);
    addRecipe(recipe("a", { title: "Again" }));
    expect(ids()).toEqual(["a", "c", "b"]);
  });

  it("saves what the server sent back over the recipe, whole", () => {
    loadRecipes([recipe("a", { fridgeLifeDays: 3, notes: "keep" })]);
    saveRecipe(recipe("a", { fridgeLifeDays: 5 }));
    expect(recipeStoreState().byId.get("a")).toMatchObject({ fridgeLifeDays: 5, notes: "keep" });
  });

  it("does not bring back a recipe the store has not got", () => {
    loadRecipes([recipe("a")]);
    saveRecipe(recipe("gone"));
    expect(ids()).toEqual(["a"]);
  });

  it("hides a recipe and shows it again in the same place", () => {
    loadRecipes([recipe("a"), recipe("b"), recipe("c")]);
    hideRecipe("b");
    expect(ids()).toEqual(["a", "c"]);
    expect(recipeStoreState().hidden.has("b")).toBe(true);
    showRecipe("b");
    expect(ids()).toEqual(["a", "b", "c"]);
  });

  it("keeps a hidden recipe hidden when the list is loaded again", () => {
    loadRecipes([recipe("a"), recipe("b")]);
    hideRecipe("a");
    loadRecipes([recipe("a"), recipe("b")]); // a retry while the delete's Undo is still showing
    expect(ids()).toEqual(["b"]);
  });

  it("takes a deleted recipe's meals off a page's older read, and Undo brings them back", () => {
    loadRecipes([recipe("a"), recipe("b")]);
    const older = [
      { id: "e1", recipeId: "a", recipe: recipe("a") },
      { id: "e2", recipeId: "b", recipe: recipe("b") },
    ];
    const read = () => liveEntries(older, recipeStoreState().byId, recipeStoreState().hidden).map((e) => e.id);
    hideRecipe("a");
    expect(read()).toEqual(["e2"]);
    showRecipe("a");
    expect(read()).toEqual(["e1", "e2"]);
  });

  it("clears on logout, hidden ones included", () => {
    loadRecipes([recipe("a")]);
    hideRecipe("a");
    clearRecipes();
    expect(recipeStoreState().recipes).toEqual([]);
    expect(recipeStoreState().hidden.size).toBe(0);
  });
});

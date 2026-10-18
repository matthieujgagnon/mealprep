import { describe, expect, it } from "vitest";
import { liveEntries } from "./liveRecipes.js";

const recipe = (id, extra = {}) => ({ id, title: `Recipe ${id}`, fridgeLifeDays: 3, ingredients: [{ name: "rice" }], ...extra });
const entry = (id, r, extra = {}) => ({ id, recipeId: r.id, recipe: r, dayOfWeek: 0, mealType: "dinner", ...extra });
const store = (...recipes) => new Map(recipes.map((r) => [r.id, r]));
const NONE = new Set();

describe("liveEntries", () => {
  it("shows the store's recipe on a meal, not the copy it arrived with", () => {
    const old = recipe("a");
    const edited = recipe("a", { fridgeLifeDays: 5, ingredients: [{ name: "rice" }, { name: "lime" }] });
    const [live] = liveEntries([entry("e1", old)], store(edited), NONE);
    expect(live.recipe.fridgeLifeDays).toBe(5);
    expect(live.recipe.ingredients).toHaveLength(2);
    expect(live.id).toBe("e1"); // the rest of the meal is untouched
  });

  it("keeps the meal's own copy for a recipe the store has not got (a note's placeholder)", () => {
    const note = recipe("note", { isPlaceholder: true, title: "Hockey pool" });
    const [live] = liveEntries([entry("e1", note)], store(recipe("a")), NONE);
    expect(live.recipe).toBe(note);
  });

  it("leaves out the meals of a hidden recipe, and only those", () => {
    const a = recipe("a");
    const b = recipe("b");
    const live = liveEntries([entry("e1", a), entry("e2", b)], store(b), new Set(["a"]));
    expect(live.map((e) => e.id)).toEqual(["e2"]);
  });

  it("hides a meal by its recipeId even when its copy is missing", () => {
    const live = liveEntries([{ id: "e1", recipeId: "a", recipe: null }], store(), new Set(["a"]));
    expect(live).toEqual([]);
  });

  it("gives back the same array and the same meals when nothing changed", () => {
    const a = recipe("a");
    const entries = [entry("e1", a), entry("e2", a)];
    expect(liveEntries(entries, store(a), NONE)).toBe(entries);
  });

  it("gives the same live meal again for the same recipe, so what keys on a meal does not run again", () => {
    const old = recipe("a");
    const edited = recipe("a", { title: "New" });
    const row = entry("e1", old);
    const first = liveEntries([row], store(edited), NONE)[0];
    const again = liveEntries([row, entry("e2", old)], store(edited), NONE)[0];
    expect(again).toBe(first);
  });

  it("makes a new live meal when the recipe is saved again", () => {
    const old = recipe("a");
    const row = entry("e1", old);
    const one = liveEntries([row], store(recipe("a", { title: "One" })), NONE)[0];
    const two = liveEntries([row], store(recipe("a", { title: "Two" })), NONE)[0];
    expect(one.recipe.title).toBe("One");
    expect(two.recipe.title).toBe("Two");
  });

  it("passes what is not a list through (a read that has not arrived)", () => {
    expect(liveEntries(null, store(), NONE)).toBeNull();
    expect(liveEntries(undefined, store(), NONE)).toBeUndefined();
  });
});

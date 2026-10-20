import { describe, expect, it } from "vitest";
import { preparedMatches } from "./preparedRecipes.js";

const meal = (id, name, extra = {}) => ({ id, name, isPreparedMeal: true, location: "freezer", quantity: 4, unit: "unit", ...extra });
const due = (entryId, ...names) => ({ entryId, recipe: { ingredients: names.map((name) => ({ name })) } });

describe("which Inventory item a planned prepared recipe is eaten from", () => {
  it("is the prepared meal with its name, by the matcher (French names and plurals too)", () => {
    const inventory = [meal("a", "Croissants"), meal("b", "Chicken nuggets")];
    expect(preparedMatches([due("e1", "croissant"), due("e2", "nuggets de poulet")], inventory)).toEqual([
      { entryId: "e1", itemId: "a" },
      { entryId: "e2", itemId: "b" },
    ]);
  });

  it("is never an ingredient, a leftover or another dish", () => {
    const inventory = [{ id: "i", name: "Croissants", location: "pantry" }, meal("l", "Croissants", { isPreparedMeal: false, isLeftover: true, unit: "portion" }), meal("p", "Pizza")];
    expect(preparedMatches([due("e1", "croissants")], inventory)).toEqual([]);
  });

  it("takes the one that goes off first, and the first ingredient that is held", () => {
    const inventory = [meal("late", "Croissants", { expiresAt: "2026-12-01" }), meal("soon", "Croissants", { expiresAt: "2026-10-20" }), meal("x", "Bagels")];
    expect(preparedMatches([due("e1", "croissants")], inventory)).toEqual([{ entryId: "e1", itemId: "soon" }]);
    expect(preparedMatches([due("e2", "brioche", "bagels")], inventory)).toEqual([{ entryId: "e2", itemId: "x" }]);
  });

  it("says nothing for a meal with nothing to eat from", () => {
    expect(preparedMatches([due("e1", "croissants")], [])).toEqual([]);
    expect(preparedMatches(null, [meal("a", "Croissants")])).toEqual([]);
  });
});

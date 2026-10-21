import { afterAll, describe, expect, it, vi } from "vitest";
import { preparedMatches } from "./preparedRecipes.js";
import { addDays, quebecDay } from "./quebecDay.js";

// A fixed clock: 11:30 p.m. in Quebec on Oct 14, 2026, already Oct 15 in UTC. The matcher skips an
// item past its use-by day, counted in Quebec calendar days, so every use-by date here is worked
// out from this clock ("2 days from now") and never typed as a calendar date: a typed date is only
// good until its day passes, and then the test fails on its own (this one did, on Oct 21).
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-10-15T03:30:00Z"));
afterAll(() => vi.useRealTimers());

const inDays = (n) => addDays(quebecDay(), n);

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
    const inventory = [meal("late", "Croissants", { expiresAt: inDays(45) }), meal("soon", "Croissants", { expiresAt: inDays(2) }), meal("x", "Bagels")];
    expect(preparedMatches([due("e1", "croissants")], inventory)).toEqual([{ entryId: "e1", itemId: "soon" }]);
    expect(preparedMatches([due("e2", "brioche", "bagels")], inventory)).toEqual([{ entryId: "e2", itemId: "x" }]);
  });

  it("takes one that is still good before one past its use-by day; the use-by day itself is still good (Quebec days)", () => {
    const gone = meal("gone", "Croissants", { expiresAt: inDays(-1) });
    const last = meal("last", "Croissants", { expiresAt: inDays(0) });
    expect(preparedMatches([due("e1", "croissants")], [gone, last])).toEqual([{ entryId: "e1", itemId: "last" }]);
    expect(preparedMatches([due("e1", "croissants")], [last, gone])).toEqual([{ entryId: "e1", itemId: "last" }]);
  });

  it("says nothing for a meal with nothing to eat from", () => {
    expect(preparedMatches([due("e1", "croissants")], [])).toEqual([]);
    expect(preparedMatches(null, [meal("a", "Croissants")])).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { isMealItem as server, isPreparedMeal as serverPrepared } from "./mealItem.js";
import { isMealItem as client, isPreparedMeal as clientPrepared } from "../../../client/src/lib/mealItem.js";

// The browser's copy of the "is a meal" rule (client/src/lib/mealItem.js) must give
// the same answers as the server's.
describe("an Inventory item is a meal when it is a leftover or a prepared meal", () => {
  const cases = [
    [{ isLeftover: true }, true],
    [{ isPreparedMeal: true }, true],
    [{ isLeftover: true, isPreparedMeal: true }, true],
    [{ isLeftover: false, isPreparedMeal: false }, false],
    [{ name: "Chicken, Broccoli and Cheddar Puff Pastry" }, false],
    [{}, false],
    [null, false],
    [undefined, false],
    // Only a real true counts: a stray value from a form is not a tag.
    [{ isPreparedMeal: "true" }, false],
    [{ isPreparedMeal: 1 }, false],
  ];

  it.each(cases)("%j -> %s", (item, expected) => {
    expect(server(item)).toBe(expected);
    expect(client(item)).toBe(expected);
  });
});

// A prepared meal is a meal that was tagged by hand, never a leftover (the two are never both on).
describe("an Inventory item is a prepared meal", () => {
  it.each([
    [{ isPreparedMeal: true }, true],
    [{ isPreparedMeal: true, isLeftover: true }, false],
    [{ isLeftover: true }, false],
    [{ isPreparedMeal: "true" }, false],
    [{}, false],
    [null, false],
  ])("%j -> %s", (item, expected) => {
    expect(serverPrepared(item)).toBe(expected);
    expect(clientPrepared(item)).toBe(expected);
  });
});

// A planned prepared meal is a note named by the same words as the strings; when its
// Inventory item has gone the name is all that says what it was.
import { PREPARED_NOTE_LEADS, isPreparedNoteTitle } from "./mealItem.js";
import { PREPARED_NOTE_LEADS as clientLeads, isPreparedNoteTitle as clientIsPreparedNote } from "../../../client/src/lib/mealItem.js";
import { en } from "../../../client/src/i18n/en.js";
import { fr } from "../../../client/src/i18n/fr.js";

describe("the prepared-meal note's name", () => {
  it("is the same two leads on the server and in the browser, and the strings' own", () => {
    expect(clientLeads).toEqual(PREPARED_NOTE_LEADS);
    expect(PREPARED_NOTE_LEADS).toEqual([en.planner.preparedNote.replace("{name}", ""), fr.planner.preparedNote.replace("{name}", "")]);
  });

  it.each([
    ["Prepared meal · Lasagna", true],
    ["Plat préparé · Lasagne", true],
    ["Leftovers · pizza", false],
    ["Plat préparé", false],
    ["Ordering food", false],
    [null, false],
  ])("%s -> %s", (title, expected) => {
    expect(isPreparedNoteTitle(title)).toBe(expected);
    expect(clientIsPreparedNote(title)).toBe(expected);
  });
});

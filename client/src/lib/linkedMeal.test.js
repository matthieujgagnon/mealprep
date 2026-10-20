import { describe, expect, it } from "vitest";
import { linkedMeal, linkedMeals } from "./linkedMeal.js";

const note = (title, extra = {}) => ({ id: "e1", isLeftover: true, leftoverItemId: "i1", photoUrl: null, recipe: { title, isPlaceholder: true }, ...extra });
const lasagne = { id: "i1", name: "Lasagne", isPreparedMeal: true, quantity: 4, unit: "portion", imageUrl: "/api/recipe-images/live" };
const tacos = { id: "i1", name: "Tacos", isLeftover: true, quantity: 2, unit: "portion", imageUrl: "/api/recipe-images/tacos" };

describe("linkedMeal", () => {
  it("a planned prepared meal is a photo card with the item's live photo, its name and its amount", () => {
    expect(linkedMeal(note("Plat préparé · Lasagne"), [lasagne])).toMatchObject({
      prepared: true,
      name: "Lasagne",
      photoUrl: "/api/recipe-images/live",
      fit: "contain",
      amount: "4 portions",
    });
  });

  it("reads the photo live: a changed photo shows, whatever copy the entry kept", () => {
    const entry = note("Plat préparé · Lasagne", { photoUrl: "/api/recipe-images/old-copy" });
    expect(linkedMeal(entry, [{ ...lasagne, imageUrl: "/api/recipe-images/changed" }]).photoUrl).toBe("/api/recipe-images/changed");
    // The item has no picture now: the card has none either, not the stale copy.
    expect(linkedMeal(entry, [{ ...lasagne, imageUrl: null }]).photoUrl).toBeNull();
    expect(linkedMeal(entry, [{ ...lasagne, imageUrl: "none" }]).photoUrl).toBeNull();
  });

  it("once the item has left Inventory the entry's copy keeps the photo, and the note's name says what it was", () => {
    const entry = note("Plat préparé · Perogies", { leftoverItemId: "gone", photoUrl: "/api/recipe-images/copy" });
    expect(linkedMeal(entry, [])).toMatchObject({ prepared: true, name: "Perogies", photoUrl: "/api/recipe-images/copy", amount: "" });
    expect(linkedMeal(note("Prepared meal · Perogies", { leftoverItemId: "gone" }), []).photoUrl).toBeNull();
  });

  it("a prepared meal with no photo is still a card (the placeholder), never the note", () => {
    expect(linkedMeal(note("Plat préparé · Pâté"), [{ ...lasagne, imageUrl: null }])).toMatchObject({ prepared: true, photoUrl: null });
  });

  it("amounts keep the unit they were typed in", () => {
    const bag = { ...lasagne, quantity: 1, unit: "bag" };
    expect(linkedMeal(note("Plat préparé · Pierogi"), [bag]).amount).toMatch(/^1 /);
    expect(linkedMeal(note("Plat préparé · Pierogi"), [{ ...lasagne, quantity: null }]).amount).toBe("");
  });

  it("leftovers typed in by hand are a photo card only when their item has a photo", () => {
    expect(linkedMeal(note("Restes · Tacos"), [tacos])).toMatchObject({ prepared: false, name: "Tacos", photoUrl: "/api/recipe-images/tacos", fit: "cover" });
    expect(linkedMeal(note("Restes · Tacos"), [{ ...tacos, imageUrl: null }])).toBeNull();
    expect(linkedMeal(note("Leftovers · Tacos", { leftoverItemId: "gone", photoUrl: "/api/recipe-images/copy" }), [])).toMatchObject({ prepared: false, photoUrl: "/api/recipe-images/copy" });
  });

  it("is never a recipe card, a plain note, a blank card or a meal that is not a leftover", () => {
    expect(linkedMeal({ id: "r", isLeftover: true, leftoverItemId: "i1", recipe: { title: "Chili", isPlaceholder: false } }, [lasagne])).toBeNull();
    expect(linkedMeal(note("Brunch out", { isLeftover: false, leftoverItemId: null }), [])).toBeNull();
    expect(linkedMeal(note("No meal planned", { isLeftover: false }), [])).toBeNull();
    expect(linkedMeal(note("Plat préparé · Not eaten from", { isLeftover: false }), [lasagne])).toBeNull();
    expect(linkedMeal(note("Restes · pizza", { leftoverItemId: null }), [])).toBeNull();
  });

  it("linkedMeals lists the cards by entry id", () => {
    const map = linkedMeals([note("Plat préparé · Lasagne"), note("Brunch out", { id: "e2", isLeftover: false })], [lasagne]);
    expect([...map.keys()]).toEqual(["e1"]);
  });
});

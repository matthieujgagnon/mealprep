import { describe, expect, it } from "vitest";
import { defaultShelfOf, keptThere, onShelf, placeOnShelf, shelfOf, storageLabelOf, storageOf } from "./shelves.js";

const ids = new Set(["fridge", "freezer", "pantry", "leftovers", "prepared", "spices"]);
const item = (extra = {}) => ({ id: "i", name: "Peas", location: "freezer", shelf: null, isLeftover: false, isPreparedMeal: false, ...extra });
const lasagna = (extra = {}) => item({ name: "Lasagna", isPreparedMeal: true, ...extra });

describe("which shelf an item shows on", () => {
  it("is the shelf of where it is kept, unless the person chose another", () => {
    expect(shelfOf(item(), ids)).toBe("freezer");
    expect(shelfOf(item({ shelf: "spices" }), ids)).toBe("spices");
    expect(shelfOf(item({ location: "fridge", shelf: "pantry" }), ids)).toBe("pantry");
  });

  it("a leftover is always on Leftovers, whatever it says", () => {
    expect(shelfOf(item({ isLeftover: true, location: "fridge" }), ids)).toBe("leftovers");
    expect(shelfOf(item({ isLeftover: true, shelf: "spices" }), ids)).toBe("leftovers");
  });

  it("a prepared meal is on Prepared meals by default, wherever it is kept, until it is moved", () => {
    expect(shelfOf(lasagna(), ids)).toBe("prepared");
    expect(shelfOf(lasagna({ location: "pantry" }), ids)).toBe("prepared");
    expect(shelfOf(lasagna({ shelf: "freezer" }), ids)).toBe("freezer");
    expect(shelfOf(lasagna({ shelf: "spices" }), ids)).toBe("spices");
    // Tagged later: an item with no chosen shelf goes to Prepared meals; one on a section stays.
    expect(shelfOf(item({ isPreparedMeal: true }), ids)).toBe("prepared");
    expect(shelfOf(item({ isPreparedMeal: true, shelf: "spices" }), ids)).toBe("spices");
  });

  it("a chosen shelf that no longer exists is the default shelf", () => {
    expect(shelfOf(item({ shelf: "deleted" }), ids)).toBe("freezer");
    expect(shelfOf(lasagna({ shelf: "deleted" }), ids)).toBe("prepared");
    expect(shelfOf(item({ shelf: "deleted" }))).toBe("deleted"); // no list to check against
  });

  it("an item whose storage is not known yet stays on its section", () => {
    const stranded = item({ location: "spices-id", shelf: "spices" });
    expect(storageOf(stranded)).toBeNull();
    expect(shelfOf(stranded, ids)).toBe("spices");
    expect(defaultShelfOf(item({ location: "spices-id", shelf: null }))).toBe("spices-id");
    expect(onShelf(stranded, "spices", ids)).toBe(true);
  });
});

describe("dropping an item on a shelf", () => {
  it("on Fridge, Freezer or Pantry says it is kept there now, and the shelf is its default", () => {
    expect(placeOnShelf(item({ location: "fridge" }), "freezer", ids)).toEqual({ location: "freezer" });
    expect(placeOnShelf(item({ location: "freezer", shelf: "spices" }), "freezer", ids)).toEqual({ shelf: null });
    expect(placeOnShelf(item({ location: "freezer", shelf: "spices" }), "fridge", ids)).toEqual({ location: "fridge", shelf: null });
    // Not kept anywhere known yet: dropping it on Pantry says where.
    expect(placeOnShelf(item({ location: "spices-id", shelf: "spices" }), "pantry", ids)).toEqual({ location: "pantry", shelf: null });
  });

  it("on Prepared meals or a section of their own changes the shelf only, never where it is kept", () => {
    expect(placeOnShelf(item({ location: "freezer" }), "spices", ids)).toEqual({ shelf: "spices" });
    expect(placeOnShelf(item({ location: "freezer" }), "prepared", ids)).toEqual({ shelf: "prepared" });
    expect(placeOnShelf(item({ location: "freezer", shelf: "spices" }), "prepared", ids)).toEqual({ shelf: "prepared" });
  });

  it("moving a prepared meal sticks: the choice is kept, and Prepared meals is its default again", () => {
    expect(placeOnShelf(lasagna({ location: "freezer" }), "freezer", ids)).toEqual({ shelf: "freezer" });
    expect(placeOnShelf(lasagna({ location: "freezer" }), "fridge", ids)).toEqual({ location: "fridge", shelf: "fridge" });
    expect(placeOnShelf(lasagna({ location: "freezer" }), "spices", ids)).toEqual({ shelf: "spices" });
    expect(placeOnShelf(lasagna({ location: "freezer", shelf: "freezer" }), "prepared", ids)).toEqual({ shelf: null });
    expect(placeOnShelf(lasagna({ location: "freezer" }), "prepared", ids)).toBeNull(); // already there
  });

  it("does nothing when it is already there, for a leftover, or onto Leftovers", () => {
    expect(placeOnShelf(item({ location: "freezer" }), "freezer", ids)).toBeNull();
    expect(placeOnShelf(item({ shelf: "spices" }), "spices", ids)).toBeNull();
    expect(placeOnShelf(item({ isLeftover: true, location: "fridge" }), "freezer", ids)).toBeNull();
    expect(placeOnShelf(item(), "leftovers", ids)).toBeNull();
  });

  it("choosing the Freezer shelf for something kept in the fridge also says it is kept in the freezer", () => {
    expect(placeOnShelf(item({ location: "fridge", shelf: "freezer" }), "freezer", ids)).toEqual({ location: "freezer", shelf: null });
  });

  it("the use-by date follows where it is kept now, and only then", () => {
    const peas = item({ location: "fridge", locations: { freezer: { expiresAt: "2027-06-01T00:00:00Z" }, fridge: { expiresAt: "2026-10-25T00:00:00Z" } } });
    expect(keptThere(peas, placeOnShelf(peas, "freezer", ids))).toBe("2027-06-01T00:00:00Z");
    expect(keptThere(peas, placeOnShelf(peas, "spices", ids))).toBeNull(); // a shelf only: the date is left as it is
    expect(keptThere(item({ locations: {} }), { location: "pantry" })).toBeNull(); // no USDA range for it
  });
});

describe("the small 'kept in' label", () => {
  it("is shown on a shelf that is not the shelf of where it is kept, and nowhere else", () => {
    expect(storageLabelOf(item({ location: "freezer" }), ids)).toBeNull(); // on the Freezer shelf
    expect(storageLabelOf(item({ location: "freezer", shelf: "spices" }), ids)).toBe("freezer");
    expect(storageLabelOf(lasagna({ location: "freezer" }), ids)).toBe("freezer");
    expect(storageLabelOf(lasagna({ location: "pantry" }), ids)).toBe("pantry");
    expect(storageLabelOf(item({ isLeftover: true, location: "fridge" }), ids)).toBe("fridge");
    expect(storageLabelOf(lasagna({ location: "fridge", shelf: "fridge" }), ids)).toBeNull(); // chose the Fridge shelf
  });

  it("is never made up for an item whose storage is not known yet", () => {
    expect(storageLabelOf(item({ location: "spices-id", shelf: "spices" }), ids)).toBeNull();
  });
});

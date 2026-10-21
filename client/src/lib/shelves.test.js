import { describe, expect, it } from "vitest";
import { defaultShelfOf, keptThere, onShelf, ownShelfOf, placeOnShelf, shelfOf, shelfSetOf, storageLabelOf, storageOf } from "./shelves.js";

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

// Any shelf can be deleted. Deleting HIDES it: nothing is written onto an item, and its items show
// on the shelf it moved to (`shelfSetOf`, `shelfOf`).
describe("a hidden shelf", () => {
  const ORDER = ["fridge", "freezer", "pantry", "leftovers", "prepared", "spices"];
  // The page's shelves in order, with some hidden: { id: movedTo }.
  const shelves = (hidden = {}) => shelfSetOf(ORDER.map((id) => (id in hidden ? { id, hidden: true, movedTo: hidden[id] } : { id })));

  it("a plain Set still means nothing is hidden", () => {
    expect(shelfOf(item(), ids)).toBe("freezer");
    expect(shelfSetOf(ORDER.map((id) => ({ id }))).redirects.size).toBe(0);
    expect(shelfOf(item(), shelves())).toBe("freezer");
  });

  it("each built-in shelf in turn: its items show on the shelf they moved to, and nothing else moves", () => {
    const peas = item({ location: "freezer" });
    const milk = item({ id: "m", name: "Milk", location: "fridge" });
    const rice = item({ id: "r", name: "Rice", location: "pantry" });
    const stew = item({ id: "s", name: "Stew", location: "fridge", isLeftover: true });
    const lasagna = item({ id: "l", name: "Lasagna", location: "freezer", isPreparedMeal: true });
    const cumin = item({ id: "c", name: "Cumin", location: "pantry", shelf: "spices" });
    const all = [peas, milk, rice, stew, lasagna, cumin];
    const home = (list, set) => Object.fromEntries(list.map((it) => [it.name, shelfOf(it, set)]));
    expect(home(all, shelves())).toEqual({ Peas: "freezer", Milk: "fridge", Rice: "pantry", Stew: "leftovers", Lasagna: "prepared", Cumin: "spices" });
    const expected = {
      fridge: { Milk: "pantry" },
      freezer: { Peas: "fridge" },
      pantry: { Rice: "fridge" },
      leftovers: { Stew: "fridge" },
      prepared: { Lasagna: "fridge" },
    };
    for (const [hidden, moved] of Object.entries(expected)) {
      const target = hidden === "fridge" ? "pantry" : "fridge";
      expect(home(all, shelves({ [hidden]: target })), hidden).toEqual({ ...home(all, shelves()), ...moved });
    }
  });

  it("an item that chose the hidden shelf, a prepared meal on Freezer or one of their own, follows it too", () => {
    expect(shelfOf(lasagna({ shelf: "freezer" }), shelves({ freezer: "pantry" }))).toBe("pantry");
    expect(shelfOf(item({ location: "pantry", shelf: "spices" }), shelves({ spices: "fridge" }))).toBe("fridge");
    expect(ownShelfOf(item({ location: "pantry", shelf: "spices" }), shelves({ spices: "fridge" }))).toBe("spices");
  });

  it("new items follow without being written to: they only say where they are kept", () => {
    const fresh = item({ name: "Frozen corn", location: "freezer", shelf: null });
    expect(shelfOf(fresh, shelves({ freezer: "fridge" }))).toBe("fridge");
    expect(fresh.shelf).toBeNull();
    // Bring the shelf back and the same item is on Freezer again.
    expect(shelfOf(fresh, shelves())).toBe("freezer");
  });

  it("where it is kept is untouched: a frozen item on Fridge still says it is frozen, and a fridge item on Fridge says nothing", () => {
    const set = shelves({ freezer: "fridge" });
    expect(storageLabelOf(item({ location: "freezer" }), set)).toBe("freezer");
    expect(storageLabelOf(item({ location: "fridge" }), set)).toBeNull();
    expect(storageLabelOf(item({ location: "fridge", isLeftover: true }), shelves({ leftovers: "fridge" }))).toBeNull();
    expect(storageLabelOf(item({ location: "freezer", isLeftover: true }), shelves({ leftovers: "fridge" }))).toBe("freezer");
  });

  it("follows a chain of hidden shelves, and a missing target or a loop is the first shelf left", () => {
    expect(shelfOf(lasagna(), shelves({ prepared: "freezer", freezer: "fridge" }))).toBe("fridge");
    expect(shelfOf(item(), shelves({ freezer: null }))).toBe("fridge");
    expect(shelfOf(item(), shelves({ freezer: "gone" }))).toBe("fridge");
    expect(shelfOf(item(), shelves({ fridge: "freezer", freezer: "fridge" }))).toBe("pantry");
    // Leftovers is never the place the others go to.
    expect(shelfSetOf([{ id: "leftovers" }, { id: "fridge", hidden: true }, { id: "pantry" }]).fallback).toBe("pantry");
  });

  it("a drop on the shelf an item shows on only because of a redirect changes nothing, storage included", () => {
    const set = shelves({ freezer: "fridge" });
    const peas = item({ location: "freezer" });
    expect(placeOnShelf(peas, "fridge", set)).toBeNull();
    // A real move still works: dropped on Pantry it is kept there now.
    expect(placeOnShelf(peas, "pantry", set)).toEqual({ location: "pantry" });
    // A fridge item dropped on Pantry, or on a section of their own, as before.
    expect(placeOnShelf(item({ location: "fridge" }), "pantry", set)).toEqual({ location: "pantry" });
    expect(placeOnShelf(item({ location: "fridge" }), "spices", set)).toEqual({ shelf: "spices" });
    // A hidden shelf is not a place to drop on, and a leftover never moves.
    expect(placeOnShelf(item({ location: "fridge" }), "freezer", set)).toBeNull();
    expect(placeOnShelf(item({ location: "fridge", isLeftover: true }), "pantry", shelves({ leftovers: "fridge" }))).toBeNull();
  });

  it("the use-by date is never touched by a shelf being hidden", () => {
    const peas = item({ location: "fridge", locations: { freezer: { expiresAt: "2027-06-01T00:00:00Z" } } });
    expect(keptThere(peas, placeOnShelf(peas, "spices", shelves({ freezer: "fridge" })))).toBeNull();
  });
});

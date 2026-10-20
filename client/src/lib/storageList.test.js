import { describe, expect, it } from "vitest";
import { emptyDuplicateShelves, normalizeName, storageChoices, unknownStorageItems } from "./storageList.js";

const item = (id, extra = {}) => ({ id, name: id, location: "freezer", shelf: null, isLeftover: false, ...extra });

describe("what the move to two fields left open", () => {
  it("lists the items whose storage was lost, and no others", () => {
    const items = [
      item("known"),
      item("perogies", { location: "m_prep", shelf: "prepared" }),
      item("paprika", { location: "spice-id", shelf: "spice-id" }),
      item("on-a-shelf-but-kept", { shelf: "spice-id" }),
      item("leftover", { isLeftover: true, location: "fridge" }),
    ];
    expect(unknownStorageItems(items).map((i) => i.id)).toEqual(["perogies", "paprika"]);
    expect(unknownStorageItems([])).toEqual([]);
  });

  it("sends only what was picked, and only a storage", () => {
    const items = [item("a", { location: "x" }), item("b", { location: "y" }), item("c", { location: "z" })];
    expect(storageChoices(items, { a: "freezer", b: "prepared", c: undefined })).toEqual([{ id: "a", location: "freezer" }]);
  });
});

describe("the old shelf that is a copy of a built-in one", () => {
  const locations = [
    { id: "old-prep", name: "Prepared meals" },
    { id: "spices", name: "Spices" },
    { id: "plats", name: " plats  PRÉPARÉS " },
  ];

  it("is offered for deletion only when nothing is on it", () => {
    expect(emptyDuplicateShelves(locations, [], []).map((l) => l.id)).toEqual(["old-prep", "plats"]);
    // Something still on it (its shelf, or its storage not known yet): left alone.
    expect(emptyDuplicateShelves(locations, [], [item("x", { shelf: "old-prep" })]).map((l) => l.id)).toEqual(["plats"]);
    expect(emptyDuplicateShelves(locations, [], [item("y", { location: "old-prep", shelf: null })]).map((l) => l.id)).toEqual(["plats"]);
  });

  it("a shelf of their own with an ordinary name is never offered, and a name given to a built-in one counts", () => {
    expect(emptyDuplicateShelves([{ id: "spices", name: "Spices" }], [], [])).toEqual([]);
    expect(emptyDuplicateShelves([{ id: "c", name: "Cave" }], [{ sectionId: "pantry", label: "Cave" }], []).map((l) => l.id)).toEqual(["c"]);
    expect(emptyDuplicateShelves([{ id: "c", name: "Cave" }], [{ sectionId: "custom-id", label: "Cave" }], [])).toEqual([]);
  });

  it("names are compared without case, accents or extra spaces", () => {
    expect(normalizeName("  Plats   PRÉPARÉS ")).toBe("plats prepares");
  });
});

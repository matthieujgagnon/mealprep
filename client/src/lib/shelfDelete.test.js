import { describe, expect, it } from "vitest";
import { countOnShelf, defaultMoveTarget, hiddenShelves, isLastShelf, moveChoices, withShelfHidden, withShelfShown } from "./shelfDelete.js";

const section = (id, extra = {}) => ({ id, label: id[0].toUpperCase() + id.slice(1), ...extra });
const all = () => ["fridge", "freezer", "pantry", "leftovers", "prepared", "spices"].map((id) => section(id));
const item = (extra = {}) => ({ id: "i", name: "Peas", location: "freezer", shelf: null, ...extra });

describe("where a deleted shelf's items go", () => {
  it("is offered every shelf that is showing, but not itself and not Leftovers", () => {
    expect(moveChoices(all(), "freezer").map((s) => s.id)).toEqual(["fridge", "pantry", "prepared", "spices"]);
    expect(moveChoices(withShelfHidden(all(), "fridge", "pantry"), "freezer").map((s) => s.id)).toEqual(["pantry", "prepared", "spices"]);
  });

  it("starts on a sensible default for each shelf, and the first shelf left when that one is gone", () => {
    const want = { freezer: "fridge", fridge: "pantry", pantry: "fridge", leftovers: "fridge", prepared: "freezer", spices: "pantry" };
    for (const [id, target] of Object.entries(want)) expect(defaultMoveTarget(all(), id), id).toBe(target);
    // Freezer's default (Fridge) is already hidden: the first shelf left.
    expect(defaultMoveTarget(withShelfHidden(all(), "fridge", "pantry"), "freezer")).toBe("pantry");
    expect(defaultMoveTarget([section("spices"), section("leftovers")], "spices")).toBeNull();
  });
});

describe("the last shelf", () => {
  it("cannot be deleted, and Leftovers does not count as one that is left", () => {
    expect(isLastShelf(all(), "freezer")).toBe(false);
    const onlySpices = all().map((s) => (s.id === "spices" ? s : { ...s, hidden: s.id !== "leftovers" }));
    expect(isLastShelf(onlySpices, "spices")).toBe(true);
    // With only Leftovers and Spices showing, deleting Leftovers is fine: Spices is left.
    expect(isLastShelf(onlySpices, "leftovers")).toBe(false);
    expect(isLastShelf([section("leftovers")], "leftovers")).toBe(true);
  });
});

describe("hiding and bringing back", () => {
  it("hides one shelf with its target and shows it again as it was, touching no other", () => {
    const sections = all().map((s) => (s.id === "freezer" ? { ...s, span: 4, height: 320, label: "Chest freezer" } : s));
    const hidden = withShelfHidden(sections, "freezer", "fridge");
    expect(hidden.find((s) => s.id === "freezer")).toMatchObject({ hidden: true, movedTo: "fridge", span: 4, height: 320, label: "Chest freezer" });
    expect(hidden.filter((s) => s.id !== "freezer")).toEqual(sections.filter((s) => s.id !== "freezer"));
    expect(withShelfShown(hidden, "freezer")).toEqual(sections.map((s) => (s.id === "freezer" ? { ...s, hidden: false, movedTo: null } : s)));
  });

  it("counts what is on a shelf now, and what would return to it", () => {
    const items = [item(), item({ id: "b", location: "fridge" }), item({ id: "c", location: "freezer", shelf: "spices" })];
    expect(countOnShelf(items, all(), "freezer")).toBe(1);
    const gone = withShelfHidden(all(), "freezer", "fridge");
    expect(countOnShelf(items, gone, "fridge")).toBe(2);
    expect(countOnShelf(items, gone, "freezer")).toBe(0);
    expect(hiddenShelves(gone, items)).toEqual([{ id: "freezer", label: "Freezer", count: 1 }]);
    expect(hiddenShelves(all(), items)).toEqual([]);
  });
});

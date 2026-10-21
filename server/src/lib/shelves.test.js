import { describe, expect, it } from "vitest";
import { BUILT_IN_NAMES, PREPARED_SHELF_ALIASES, builtInNames, hidingAfter, hidingError, isBuiltInName, isStorage, normalizeName } from "./shelves.js";
import { en } from "../../../client/src/i18n/en.js";
import { fr } from "../../../client/src/i18n/fr.js";

describe("storage is not a shelf", () => {
  it("only fridge, freezer and pantry are places to keep something", () => {
    for (const id of ["fridge", "freezer", "pantry"]) expect(isStorage(id)).toBe(true);
    for (const id of ["prepared", "leftovers", "cuid123", "", null, undefined]) expect(isStorage(id)).toBe(false);
  });
});

describe("names a shelf cannot take", () => {
  it("normalizeName ignores case, accents and extra spaces", () => {
    expect(normalizeName("  Plats   PRÉPARÉS ")).toBe("plats prepares");
    expect(normalizeName("Congélateur")).toBe("congelateur");
    expect(normalizeName(null)).toBe("");
  });

  it("is every built-in shelf's name in both languages, and the names the person gave them", () => {
    for (const name of ["Fridge", "frigo", "FREEZER", "congelateur", "Pantry", "garde-manger", "Leftovers", "restes", "Prepared meals", "plats préparés"]) {
      expect([name, isBuiltInName(name)]).toEqual([name, true]);
    }
    expect(isBuiltInName("Spices")).toBe(false);
    expect(isBuiltInName("Cave")).toBe(false);
    expect(isBuiltInName("Cave", [{ sectionId: "pantry", label: "Cave" }])).toBe(true);
    // A label on a section that is not a built-in shelf says nothing.
    expect(builtInNames([{ sectionId: "custom-id", label: "Cave" }]).has("cave")).toBe(false);
  });

  it("are the same words as the language files' own", () => {
    const names = (id) => [en.locations[id], fr.locations[id]];
    for (const id of ["fridge", "freezer", "pantry", "leftovers", "prepared"]) expect(BUILT_IN_NAMES[id]).toEqual(names(id));
  });

  it("the migration merges a shelf named like the built-in one, whichever of these it is called", () => {
    for (const alias of PREPARED_SHELF_ALIASES) expect(normalizeName(alias)).toBe(alias);
    expect(PREPARED_SHELF_ALIASES.map(normalizeName)).toEqual(expect.arrayContaining(BUILT_IN_NAMES.prepared.map(normalizeName)));
  });
});

// Any shelf can be deleted (hidden: nothing is deleted). The server's rules for a layout save.
describe("hiding a shelf", () => {
  const mine = new Set(["spices"]);
  const stored = (entries = {}) => new Map(Object.entries(entries));
  const hide = (sectionId, movedTo) => ({ sectionId, hidden: true, ...(movedTo !== undefined ? { movedTo } : {}) });

  it("every built-in shelf can be hidden in turn, as long as another is left", () => {
    for (const id of ["fridge", "freezer", "pantry", "prepared", "leftovers"]) {
      expect(hidingError(mine, stored(), [hide(id, id === "fridge" ? "pantry" : "fridge")])).toBeNull();
    }
    expect(hidingError(mine, stored(), [hide("spices", "pantry")])).toBeNull();
  });

  it("a shelf that is not shown again is shown by hidden: false, and the target goes", () => {
    const before = stored({ freezer: { hidden: true, movedTo: "fridge" } });
    const after = hidingAfter(before, [{ sectionId: "freezer", hidden: false }]);
    expect(after.get("freezer")).toEqual({ hidden: false, movedTo: null });
  });

  it("a save from an old tab that sends neither field leaves a hidden shelf hidden", () => {
    const before = stored({ freezer: { hidden: true, movedTo: "fridge" } });
    const after = hidingAfter(before, [{ sectionId: "freezer" }, { sectionId: "fridge" }]);
    expect(after.get("freezer")).toEqual({ hidden: true, movedTo: "fridge" });
    expect(after.get("fridge")).toEqual({ hidden: false, movedTo: null });
  });

  it("the last shelf that can hold ingredients cannot be hidden, and Leftovers does not count", () => {
    const rows = [hide("fridge"), hide("freezer"), hide("pantry"), hide("prepared")];
    // Their own shelf is still showing: fine.
    expect(hidingError(mine, stored(), rows)).toBeNull();
    // Hide that one too and only Leftovers is left.
    expect(hidingError(mine, stored(), [...rows, hide("spices")])).toBe("lastShelf");
    // One at a time, the same: three already hidden, hiding the fourth of four.
    const before = stored({ fridge: { hidden: true }, freezer: { hidden: true }, pantry: { hidden: true } });
    expect(hidingError(new Set(), before, [hide("prepared")])).toBe("lastShelf");
    expect(hidingError(new Set(), before, [hide("leftovers")])).toBeNull();
  });

  it("a save that changes nothing about hiding is never refused, even from a state the rule would not allow", () => {
    const before = stored({ fridge: { hidden: true }, freezer: { hidden: true }, pantry: { hidden: true }, prepared: { hidden: true } });
    expect(hidingError(new Set(), before, [{ sectionId: "fridge", hidden: true, movedTo: null }, { sectionId: "leftovers" }])).toBeNull();
  });

  it("items only go to a shelf that is showing", () => {
    expect(hidingError(mine, stored(), [hide("freezer", "fridge")])).toBeNull();
    expect(hidingError(mine, stored(), [hide("freezer", "nowhere")])).toBe("shelfMoveInvalid");
    expect(hidingError(mine, stored(), [hide("freezer", "freezer")])).toBe("shelfMoveInvalid");
    expect(hidingError(mine, stored(), [hide("freezer", "leftovers")])).toBe("shelfMoveInvalid");
    // A target that is hidden already, or hidden by the same save.
    expect(hidingError(mine, stored({ fridge: { hidden: true } }), [hide("freezer", "fridge")])).toBe("shelfMoveInvalid");
    expect(hidingError(mine, stored(), [hide("freezer", "fridge"), hide("fridge", "pantry")])).toBe("shelfMoveInvalid");
    // None given: the first shelf that is left (the client's fallback), not an error.
    expect(hidingError(mine, stored(), [hide("freezer")])).toBeNull();
  });

  it("a hidden shelf's old target is not asked again when it only goes along in a later save", () => {
    // Freezer went to Fridge; Fridge is hidden later. Saving the layout again sends Freezer's row unchanged.
    const before = stored({ freezer: { hidden: true, movedTo: "fridge" }, fridge: { hidden: true, movedTo: "pantry" } });
    expect(hidingError(mine, before, [{ sectionId: "freezer", hidden: true, movedTo: "fridge" }, { sectionId: "pantry" }])).toBeNull();
  });

  it("only the person's own shelves and the five built-in ones can be hidden", () => {
    expect(hidingError(mine, stored(), [hide("someone-elses")])).toBe("shelfInvalid");
  });
});

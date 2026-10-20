import { describe, expect, it } from "vitest";
import { BUILT_IN_NAMES, PREPARED_SHELF_ALIASES, builtInNames, isBuiltInName, isStorage, normalizeName } from "./shelves.js";
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

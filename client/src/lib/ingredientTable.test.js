import fs from "fs";
import { describe, expect, it } from "vitest";
import {
  CELL_MAX,
  FORMS_MAX,
  NAME_MAX,
  buildIndex,
  builtInRowsOf,
  cleanCells,
  cleanOverride,
  clashOf,
  effectiveRows,
  keyOf,
  parseTable,
  rowFromCells,
  rowFromOverride,
  takenSpelling,
} from "./ingredientTable.js";

// The one reader of ingredientDisplay.txt and the one set of rules for Matt's changes to it. The
// browser and the server (server/src/lib/ingredientNames.js) run this file.

const builtIn = builtInRowsOf(parseTable(fs.readFileSync(new URL("./ingredientDisplay.txt", import.meta.url), "utf8")));
const edit = (extra = {}) => ({ enOne: "biryani masala", enOther: "", frOne: "masala biryani", frOther: "", gender: "m", ...extra });

describe("a line of the table", () => {
  it("is read into English and French, singular and plural", () => {
    const row = rowFromCells(["green onion/scallion", "green onions/scallions", "oignon vert", "oignons verts", "m"]);
    expect(row.en).toEqual({ one: ["green onion", "scallion"], other: ["green onions", "scallions"] });
    expect(row.fr).toEqual({ one: ["oignon vert"], other: ["oignons verts"] });
    expect(row.gender).toBe("m");
    expect(row.alwaysPlural).toBe(false);
    expect(row.key).toBe("green onion");
  });

  it("takes = as the singular again, and p as always plural", () => {
    const row = rowFromCells(["spinach", "=", "épinards", "=", "mp"]);
    expect(row.en.other).toEqual(["spinach"]);
    expect(row.fr.other).toEqual(["épinards"]);
    expect(row.gender).toBe("m");
    expect(row.alwaysPlural).toBe(true);
  });

  it("gives every built-in row a key of its own, for an override to name", () => {
    const keys = builtIn.map((row) => row.key);
    expect(builtIn.length).toBeGreaterThan(300);
    expect(keys.every(Boolean)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("writing a name down to compare it", () => {
  it("ignores accents, capitals, apostrophes, hyphens and spaces", () => {
    expect(keyOf("Gousse d’ail")).toBe(keyOf("gousse d'ail"));
    expect(keyOf("Jalapeño")).toBe("jalapeno");
    expect(keyOf("all-purpose  flour")).toBe("all purpose flour");
    expect(keyOf("œufs")).toBe("oeufs");
  });
});

describe("checking what Matt typed", () => {
  it("tidies it and keeps the table's way of writing a side", () => {
    expect(cleanOverride(edit({ enOne: "  Biryani   masala ", enOther: "biryani masalas / Masalas  ", frOther: "=" })).data).toEqual({
      replaces: null,
      hidden: false,
      enOne: "Biryani masala",
      enOther: "biryani masalas/Masalas",
      frOne: "masala biryani",
      frOther: "=",
      gender: "m",
    });
  });

  it("saves a blank plural as the singular again", () => {
    const { data } = cleanOverride(edit());
    expect(data.enOther).toBe("=");
    expect(data.frOther).toBe("=");
  });

  it("needs a singular on each side and a gender", () => {
    expect(cleanOverride(edit({ enOne: "" })).error).toBe("ingredientEmpty");
    expect(cleanOverride(edit({ frOne: " / " })).error).toBe("ingredientEmpty");
    expect(cleanOverride(edit({ enOne: "=" })).error).toBe("ingredientEmpty");
    expect(cleanOverride(edit({ gender: undefined })).error).toBe("ingredientGender");
    expect(cleanOverride(edit({ gender: "x" })).error).toBe("ingredientGender");
    for (const gender of ["m", "f", "mp", "fp", "F "]) expect(cleanOverride(edit({ gender })).error).toBeUndefined();
  });

  it("limits the length of a spelling, a side and how many spellings a side has", () => {
    expect(cleanOverride(edit({ enOne: "a".repeat(NAME_MAX) })).error).toBeUndefined();
    expect(cleanOverride(edit({ enOne: "a".repeat(NAME_MAX + 1) }))).toMatchObject({ error: "ingredientTooLong", vars: { max: NAME_MAX } });
    const many = Array.from({ length: FORMS_MAX + 1 }, (_, i) => `spelling${i}`).join("/");
    expect(cleanOverride(edit({ enOne: many }))).toMatchObject({ error: "ingredientTooMany", vars: { max: FORMS_MAX } });
    const wide = Array.from({ length: FORMS_MAX }, () => "w".repeat(NAME_MAX)).map((w, i) => w.slice(0, -1) + i).join("/");
    expect(wide.length).toBeGreaterThan(CELL_MAX);
    expect(cleanOverride(edit({ enOne: wide })).error).toBe("ingredientTooLong");
  });

  it("refuses a |, which the table uses between sides, and removes control characters", () => {
    expect(cleanOverride(edit({ frOne: "a | b" })).error).toBe("ingredientChars");
    expect(cleanOverride(edit({ enOne: "bi\u0000ryani\tmasala" })).data.enOne).toBe("bi ryani masala");
  });

  it("drops a spelling written twice", () => {
    expect(cleanOverride(edit({ enOne: "masala/Masala/masala " })).data.enOne).toBe("masala");
  });

  it("hides a built-in row: names are dropped and the row it hides is needed", () => {
    expect(cleanOverride({ hidden: true })).toMatchObject({ error: "ingredientHideNeedsBuiltIn" });
    expect(cleanOverride({ hidden: true, replaces: "Garlic Clove", enOne: "x" }).data).toEqual({
      replaces: "garlic clove", hidden: true, enOne: "", enOther: "", frOne: "", frOther: "", gender: "",
    });
  });

  it("holds on to the key of the built-in row it replaces", () => {
    expect(cleanOverride(edit({ replaces: " Garlic Clove " })).data.replaces).toBe("garlic clove");
    expect(cleanOverride(edit({ replaces: "!!!" })).error).toBe("ingredientEmpty");
  });

  it("never throws on rubbish", () => {
    for (const body of [null, undefined, 3, "x", [], { enOne: {} }]) expect(() => cleanOverride(body)).not.toThrow();
  });
});

describe("the sides on their own", () => {
  it("are tidied with nothing required", () => {
    expect(cleanCells({ enOne: " Garlic ", frOne: "" })).toEqual({ cells: { enOne: "Garlic", enOther: "=", frOne: "", frOther: "=" } });
    expect(cleanCells({})).toEqual({ cells: { enOne: "", enOther: "=", frOne: "", frOther: "=" } });
    expect(cleanCells({ frOne: "a|b" }).error).toBe("ingredientChars");
  });
});

describe("a change that clashes", () => {
  const data = (extra) => ({ replaces: null, hidden: false, enOne: "zorblax", enOther: "=", frOne: "zorblaxe", frOther: "=", gender: "m", ...extra });
  const other = { id: "o1", replaces: null, hidden: false, enOne: "zorblax", enOther: "=", frOne: "zorblaxe", frOther: "=", gender: "m" };

  it("is found among the built-in rows and the other changes, with the name of the row that has it", () => {
    expect(clashOf(data({ enOne: "Garlic" }), builtIn, [])).toEqual({ error: "ingredientTaken", vars: { form: "Garlic", other: "garlic" } });
    expect(clashOf(data(), builtIn, [other])).toEqual({ error: "ingredientTaken", vars: { form: "zorblax", other: "zorblax" } });
    expect(clashOf(data(), builtIn, [])).toBeNull();
  });

  it("does not count the change itself, the built-in row it replaces, or a hidden change", () => {
    expect(clashOf(data(), builtIn, [other], other)).toBeNull();
    expect(clashOf(data({ replaces: "garlic", enOne: "garlic", frOne: "ail" }), builtIn, [])).toBeNull();
    expect(clashOf(data({ hidden: true, enOne: "garlic" }), builtIn, [])).toBeNull();
  });

  it("is not found for a row another change replaced", () => {
    const replaced = { id: "r1", replaces: "garlic", hidden: true, enOne: "", enOther: "", frOne: "", frOther: "", gender: "" };
    expect(clashOf(data({ enOne: "garlic", frOne: "ail" }), builtIn, [replaced])).toBeNull();
  });
});

describe("the rows in use", () => {
  const garlic = builtIn.find((row) => row.key === "garlic clove");
  const replace = { id: "r1", replaces: "garlic clove", hidden: false, enOne: "clove of garlic", enOther: "cloves of garlic", frOne: "caïeu d'ail", frOther: "caïeux d'ail", gender: "m" };

  it("are the built-in rows when nothing is changed", () => {
    expect(effectiveRows(builtIn, [])).toEqual(builtIn);
    expect(effectiveRows(builtIn, null)).toEqual(builtIn);
  });

  it("put Matt's rows first and leave out the built-in row one of them replaces", () => {
    const rows = effectiveRows(builtIn, [replace]);
    expect(rows[0].fr.one).toEqual(["caïeu d'ail"]);
    expect(rows[0].key).toBe("garlic clove");
    expect(rows[0].override).toBe(replace);
    expect(rows).not.toContain(garlic);
    expect(rows).toHaveLength(builtIn.length);
  });

  it("take a row off when it is hidden, and add one that replaces nothing", () => {
    const added = { id: "a1", replaces: null, hidden: false, enOne: "biryani masala", enOther: "=", frOne: "masala biryani", frOther: "=", gender: "m" };
    const rows = effectiveRows(builtIn, [{ ...replace, hidden: true }, added]);
    expect(rows).toHaveLength(builtIn.length); // one less, one more
    expect(rows.some((row) => row.key === "garlic clove")).toBe(false);
    expect(rows[0].en.one).toEqual(["biryani masala"]);
    expect(rows[0].key).toBeNull();
  });

  it("keep an override whose built-in row the file no longer has, as an added row", () => {
    const orphan = { ...replace, replaces: "a row that was taken out of the file" };
    const rows = effectiveRows(builtIn, [orphan]);
    expect(rows).toHaveLength(builtIn.length + 1);
    expect(rows[0].fr.one).toEqual(["caïeu d'ail"]);
  });

  it("read a row of Matt's the way the table's lines are read", () => {
    const row = rowFromOverride({ ...replace, enOther: "=", frOther: "=", gender: "fp" });
    expect(row.en.other).toEqual(["clove of garlic"]);
    expect(row.gender).toBe("f");
    expect(row.alwaysPlural).toBe(true);
  });
});

describe("a spelling another row already has", () => {
  it("is found in the same language, whatever the number, accents or capitals", () => {
    const row = rowFromOverride({ ...edit(), enOne: "Onions", enOther: "=" });
    expect(takenSpelling(row, builtIn)).toMatchObject({ form: "Onions", lang: "en" });
    expect(takenSpelling(rowFromOverride({ ...edit(), frOne: "ECHALOTE" }), builtIn)).toMatchObject({ lang: "fr" });
    expect(takenSpelling(rowFromOverride({ ...edit(), frOne: "x", frOther: "échalotes" }), builtIn).other.key).toBe("shallot");
  });

  it("is not found for a word that is the other language's (« raisin »), nor for a new name", () => {
    expect(takenSpelling(rowFromOverride({ ...edit(), enOne: "tomate" }), builtIn)).toBeNull();
    expect(takenSpelling(rowFromOverride(edit()), builtIn)).toBeNull();
  });

  it("does not count the row's own spellings if that row is left out of the others", () => {
    const garlic = builtIn.find((row) => row.key === "garlic clove");
    expect(takenSpelling(garlic, builtIn.filter((row) => row !== garlic))).toBeNull();
    expect(takenSpelling(garlic, builtIn)).toMatchObject({ other: garlic });
  });
});

describe("looking names up", () => {
  it("finds no clash in the built-in table, and reads « raisin » as ambiguous", () => {
    const index = buildIndex(builtIn);
    expect(index.conflicts).toEqual([]);
    expect(index.ambiguous).toContain("raisin");
  });

  it("lets the first row win a spelling two rows both claim, and says so", () => {
    const a = rowFromCells(["thing", "things", "chose", "choses", "f"]);
    const b = rowFromCells(["gadget", "gadgets", "chose", "choses", "f"]);
    const index = buildIndex([a, b]);
    expect(index.conflicts).toHaveLength(2);
    expect(index.nounIndex.get("chose").find((entry) => entry.lang === "fr").row).toBe(a);
  });

  it("remembers the names that start with a capital because they are names", () => {
    expect(buildIndex(builtIn).properFirstWords.has("roma")).toBe(true);
  });
});

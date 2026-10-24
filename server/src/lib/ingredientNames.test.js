import { describe, expect, it, vi } from "vitest";
import { OVERRIDES_MAX } from "../../../client/src/lib/ingredientTable.js";
import { __messages, fail } from "./i18n.js";
import { builtInIngredientRows, checkOverride, loadBuiltInRows, overrideRow } from "./ingredientNames.js";

const rows = builtInIngredientRows();
const edit = (extra = {}) => ({ enOne: "biryani masala", enOther: "", frOne: "masala biryani", frOther: "", gender: "m", ...extra });
const saved = (id, data) => ({ id, replaces: null, hidden: false, enOther: "=", frOther: "=", gender: "m", ...data });

describe("the built-in names table, read by the server", () => {
  it("is the file in the repo, read with the same parser as the browser", async () => {
    expect(rows.length).toBeGreaterThan(300);
    const { ingredientRows } = await import("../../../client/src/lib/ingredientDisplay.js");
    expect(rows.map((row) => row.line)).toEqual(ingredientRows.map((row) => row.line));
    expect(rows.map((row) => row.key)).toEqual(ingredientRows.map((row) => row.key));
  });

  it("gives every row a key of its own, for an override to name", () => {
    const keys = rows.map((row) => row.key);
    expect(keys.every(Boolean)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("garlic clove");
  });

  it("is null, and says so in the log, when the file can't be read", () => {
    const log = vi.fn();
    expect(loadBuiltInRows(new URL("file:///nowhere/ingredientDisplay.txt"), log)).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatch(/Couldn't read the ingredient names table/);
  });
});

describe("checking a change", () => {
  it("accepts a new ingredient and tidies it", () => {
    const { data, error } = checkOverride(edit({ enOne: "  Biryani   masala ", frOther: "" }), []);
    expect(error).toBeUndefined();
    expect(data).toEqual({ replaces: null, hidden: false, enOne: "Biryani masala", enOther: "=", frOne: "masala biryani", frOther: "=", gender: "m" });
  });

  it("refuses what the form refuses", () => {
    expect(checkOverride(edit({ enOne: "" }), []).error).toBe("ingredientEmpty");
    expect(checkOverride(edit({ frOne: "  " }), []).error).toBe("ingredientEmpty");
    expect(checkOverride(edit({ gender: "" }), []).error).toBe("ingredientGender");
    expect(checkOverride(edit({ gender: "x" }), []).error).toBe("ingredientGender");
    expect(checkOverride(edit({ enOne: "a|b" }), []).error).toBe("ingredientChars");
    expect(checkOverride(edit({ enOne: "a".repeat(61) }), [])).toMatchObject({ error: "ingredientTooLong", vars: { max: 60 } });
    expect(checkOverride(edit({ enOne: "a/b/c/d/e/f/g/h/i" }), [])).toMatchObject({ error: "ingredientTooMany", vars: { max: 8 } });
    expect(checkOverride(null, []).error).toBe("ingredientEmpty");
  });

  it("refuses a spelling the built-in table already has in the same language", () => {
    const first = checkOverride(edit({ enOne: "garlic" }), []);
    expect(first).toMatchObject({ error: "ingredientTaken", status: 400 });
    expect(first.vars.form).toBe("garlic");
    expect(first.vars.other).toBe("garlic");
    // the French side, a plural, another spelling, with accents, capitals and apostrophes ignored
    expect(checkOverride(edit({ frOne: "OIGNON" }), []).error).toBe("ingredientTaken");
    expect(checkOverride(edit({ enOther: "Tomatoes" }), []).error).toBe("ingredientTaken");
    expect(checkOverride(edit({ enOne: "x", enOther: "scallion/spring onion" }), []).error).toBe("ingredientTaken");
    expect(checkOverride(edit({ frOne: "Gousse d’ail" }), []).error).toBe("ingredientTaken");
    expect(checkOverride(edit({ frOne: "Échalote" }), []).error).toBe("ingredientTaken");
    expect(checkOverride(edit({ frOne: "echalote" }), []).error).toBe("ingredientTaken");
  });

  it("lets a spelling be a different food in the other language (« raisin »)", () => {
    expect(checkOverride(edit({ enOne: "raisin tart", frOne: "tarte aux raisins", enOther: "raisin tarts" }), []).error).toBeUndefined();
    // "tomate" is French only on the built-in row; the same word as an English spelling is not a clash
    expect(checkOverride(edit({ enOne: "tomate", frOne: "tomatillo mauve" }), []).error).toBeUndefined();
  });

  it("refuses a spelling another change already has, but not the change's own", () => {
    const all = [saved("a", { enOne: "biryani masala", frOne: "masala biryani" })];
    expect(checkOverride(edit({ frOne: "Masala Biryani", enOne: "other" }), all)).toMatchObject({ error: "ingredientTaken", vars: { other: "biryani masala" } });
    // changing "a" itself may keep its own spellings
    expect(checkOverride(edit({ gender: "f" }), all, all[0]).error).toBeUndefined();
  });

  it("does not count the built-in row a change replaces, and keeps the row it stands in for", () => {
    const own = checkOverride(edit({ replaces: "garlic clove", enOne: "garlic clove", enOther: "garlic cloves", frOne: "gousse d'ail", frOther: "gousses d'ail", gender: "f" }), []);
    expect(own.error).toBeUndefined();
    expect(own.data.replaces).toBe("garlic clove");
    // but it may not take another built-in row's name
    expect(checkOverride(edit({ replaces: "garlic clove", enOne: "onion" }), [])).toMatchObject({ error: "ingredientTaken" });
    // a saved change keeps its built-in row whatever the body says
    const all = [saved("g", { replaces: "garlic clove", enOne: "clove of garlic", frOne: "caïeu d'ail" })];
    expect(checkOverride(edit({ replaces: "onion", enOne: "clove of garlic", frOne: "caïeu d'ail" }), all, all[0]).data.replaces).toBe("garlic clove");
  });

  it("frees the spellings of a built-in row that another change replaced or hid", () => {
    const all = [saved("g", { replaces: "garlic clove", hidden: true, enOne: "", frOne: "" })];
    // "garlic clove" is on no row now, so it can be the name of a new ingredient
    expect(checkOverride(edit({ enOne: "garlic clove", frOne: "gousse d'ail" }), all).error).toBeUndefined();
  });

  it("hides only a built-in row that exists", () => {
    expect(checkOverride({ hidden: true }, [])).toMatchObject({ error: "ingredientHideNeedsBuiltIn" });
    expect(checkOverride({ hidden: true, replaces: "no such thing" }, [])).toMatchObject({ error: "notFound.ingredientBuiltIn", status: 404 });
    expect(checkOverride({ hidden: true, replaces: "garlic clove", enOne: "ignored" }, []).data).toEqual({
      replaces: "garlic clove", hidden: true, enOne: "", enOther: "", frOne: "", frOther: "", gender: "",
    });
  });

  it("refuses a new change for a built-in row the file doesn't have, and past the limit", () => {
    expect(checkOverride(edit({ replaces: "no such thing" }), [])).toMatchObject({ error: "notFound.ingredientBuiltIn", status: 404 });
    const many = Array.from({ length: OVERRIDES_MAX }, (_, i) => saved(`id${i}`, { enOne: `thing ${i}`, frOne: `chose ${i}` }));
    expect(checkOverride(edit(), many)).toMatchObject({ error: "ingredientLimit", vars: { max: OVERRIDES_MAX } });
    // a change to one that is there is not a new one
    expect(checkOverride(edit({ enOne: "thing 0", frOne: "chose 0" }), many, many[0]).error).toBeUndefined();
  });

  it("refuses everything, with a 503, when the built-in table could not be read", () => {
    expect(checkOverride(edit(), [], null, null)).toMatchObject({ error: "ingredientTableMissing", status: 503 });
  });
});

describe("what goes back to the app", () => {
  const row = { id: "x", replaces: null, hidden: false, enOne: "a", enOther: "=", frOne: "b", frOther: "=", gender: "m", updatedAt: new Date(0), createdAt: new Date(0), updatedById: "u1", updatedBy: { email: "matt@example.com" } };

  it("gives every account the names, and only an admin who saved it", () => {
    expect(Object.keys(overrideRow(row)).sort()).toEqual(["enOne", "enOther", "frOne", "frOther", "gender", "hidden", "id", "replaces", "updatedAt"]);
    expect(overrideRow(row, { admin: true }).updatedBy).toBe("matt@example.com");
    expect(overrideRow({ ...row, updatedBy: null }, { admin: true }).updatedBy).toBeNull();
  });
});

describe("the messages", () => {
  const keys = ["ingredientEmpty", "ingredientTooLong", "ingredientTooMany", "ingredientChars", "ingredientGender", "ingredientHideNeedsBuiltIn", "ingredientTaken", "ingredientLimit", "ingredientTableMissing"];

  it("exist in English and French, with the same placeholders", () => {
    for (const key of keys) {
      expect(__messages.en[key], key).toBeTruthy();
      expect(__messages.fr[key], key).toBeTruthy();
    }
    expect(__messages.en.notFound.ingredientName).toBeTruthy();
    expect(__messages.fr.notFound.ingredientBuiltIn).toBeTruthy();
  });

  it("say which spelling clashed, in the language asked for", () => {
    const req = (lang) => ({ headers: { "x-lang": lang } });
    expect(fail(req("en"), "ingredientTaken", { form: "garlic", other: "garlic" }).error).toBe('"garlic" is already used for another ingredient (garlic).');
    expect(fail(req("fr"), "ingredientTaken", { form: "ail", other: "garlic" }).error).toBe("« ail » est déjà utilisé pour un autre ingrédient (garlic).");
  });
});

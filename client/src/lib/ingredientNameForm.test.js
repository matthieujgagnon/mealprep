import { afterEach, describe, expect, it } from "vitest";
import { ingredientRows, setIngredientOverrides } from "./ingredientDisplay.js";
import {
  bodyOf,
  cardRows,
  changedCards,
  draftForGap,
  draftForRow,
  guessGender,
  guessPlural,
  guessSingular,
  looksPlural,
  matcherNotes,
  problemWith,
  rowName,
  searchCards,
} from "./ingredientNameForm.js";
import { cleanOverride } from "./ingredientTable.js";

// What the Admin card's form starts with and what it checks.

afterEach(() => setIngredientOverrides([]));

describe("guessing a plural", () => {
  it("in English", () => {
    const pairs = { onion: "onions", tomato: "tomatoes", potato: "potatoes", berry: "berries", bunch: "bunches", box: "boxes", dish: "dishes", day: "days", leaf: "leaves", mango: "mangos", glass: "glasses" };
    for (const [one, other] of Object.entries(pairs)) expect(guessPlural(one, "en"), one).toBe(other);
  });

  it("in French", () => {
    const pairs = { oignon: "oignons", tomate: "tomates", chou: "choux", gâteau: "gâteaux", cheval: "chevaux", riz: "riz", noix: "noix", pois: "pois" };
    for (const [one, other] of Object.entries(pairs)) expect(guessPlural(one, "fr"), one).toBe(other);
  });

  it("is nothing for nothing", () => {
    expect(guessPlural("", "en")).toBe("");
    expect(guessPlural(null, "fr")).toBe("");
  });
});

describe("guessing a singular", () => {
  it("in English", () => {
    const pairs = { onions: "onion", tomatoes: "tomato", berries: "berry", peaches: "peach", boxes: "box", cheeses: "cheese", olives: "olive", leaves: "leaf", glasses: "glass", sauces: "sauce" };
    for (const [other, one] of Object.entries(pairs)) expect(guessSingular(other, "en"), other).toBe(one);
  });

  it("in French", () => {
    const pairs = { oignons: "oignon", gâteaux: "gâteau", chevaux: "cheval", choux: "chou", tomates: "tomate" };
    for (const [other, one] of Object.entries(pairs)) expect(guessSingular(other, "fr"), other).toBe(one);
  });
});

describe("telling a plural from a singular as the recipe wrote it", () => {
  it("knows the plurals it can turn back", () => {
    for (const w of ["onions", "tomatoes", "chickpeas", "peaches"]) expect(looksPlural(w, "en"), w).toBe(true);
    for (const w of ["oignons", "pommes de terre".split(" ").pop() === "terre" ? "carottes" : "", "gâteaux"]) if (w) expect(looksPlural(w, "fr"), w).toBe(true);
  });

  it("leaves a word that ends in s in the singular alone", () => {
    for (const w of ["hummus", "asparagus", "couscous"]) expect(looksPlural(w, "en"), w).toBe(false);
    for (const w of ["noix", "riz", "anis", "pois"]) expect(looksPlural(w, "fr"), w).toBe(false);
    expect(looksPlural("oat", "en")).toBe(false);
    expect(looksPlural("ail", "fr")).toBe(false);
  });
});

describe("guessing a gender", () => {
  it("from the French singular", () => {
    for (const w of ["tomate", "carotte", "farine", "crème", "sauce", "huile", "orange", "purée", "tisane"]) expect(guessGender(w), w).toBe("f");
    for (const w of ["oignon", "ail", "poivre", "beurre", "gingembre", "fromage", "sucre", "café", "thé", "vinaigre"]) expect(guessGender(w), w).toBe("m");
    expect(guessGender("")).toBe("");
    expect(guessGender("pâte/pâtes")).toBe("f");
  });
});

describe("the form's starting values for a name with no translation", () => {
  it("puts an English name on the English side, its plural guessed, and leaves French empty", () => {
    expect(draftForGap("Biryani masala")).toEqual({ enOne: "biryani masala", enOther: "biryani masalas", frOne: "", frOther: "", gender: "", always: false });
  });

  it("puts a French name on the French side, with a gender guessed", () => {
    expect(draftForGap("Pâte de piment fort")).toMatchObject({ frOne: "pâte de piment fort", frOther: "pâte de piment forts", enOne: "", enOther: "", gender: "f" });
  });

  it("takes a name written as a plural for the plural, and works out the singular", () => {
    expect(draftForGap("Schnitzel crumbs")).toMatchObject({ enOne: "schnitzel crumb", enOther: "schnitzel crumbs" });
    expect(draftForGap("tomatillos")).toMatchObject({ enOne: "tomatillo", enOther: "tomatillos" });
  });

  it("leaves the plural blank when it is the same word", () => {
    expect(draftForGap("Riz brun")).toMatchObject({ frOne: "riz brun", frOther: "riz bruns" });
    expect(draftForGap("riz")).toMatchObject({ frOne: "riz", frOther: "" });
  });

  it("keeps a capital that is a proper name's, and lowers the one a recipe starts a line with", () => {
    expect(draftForGap("BBQ rub").enOne).toBe("BBQ rub");
    expect(draftForGap("Sriracha").enOne).toBe("sriracha");
  });
});

describe("the form's starting values for a row", () => {
  const find = (key) => ingredientRows.find((row) => row.key === key);

  it("shows its spellings, and a plural that is the singular again as blank", () => {
    expect(draftForRow(find("garlic"))).toEqual({ enOne: "garlic", enOther: "", frOne: "ail", frOther: "", gender: "m", always: false });
    expect(draftForRow(find("green onion"))).toMatchObject({ enOne: "green onion/scallion/spring onion", enOther: "green onions/scallions/spring onions" });
  });

  it("splits a gender like mp into the gender and 'always plural'", () => {
    const draft = draftForRow(find("spinach"));
    expect(draft).toMatchObject({ gender: "m", always: true });
    expect(bodyOf(draft, "spinach").gender).toBe("mp");
  });

  it("turns back into what the table says", () => {
    for (const row of ingredientRows) {
      const { data, error } = cleanOverride(bodyOf(draftForRow(row), row.key));
      expect(error, row.line).toBeUndefined();
      expect(data.enOne, row.line).toBe(row.en.one.join("/"));
      expect(data.frOne, row.line).toBe(row.fr.one.join("/"));
    }
  });
});

describe("what is wrong with a draft", () => {
  const draft = (extra) => ({ ...draftForGap("Biryani masala"), frOne: "masala biryani", gender: "m", ...extra });

  it("is nothing for a good one", () => {
    expect(problemWith(draft())).toBeNull();
  });

  it("waits for Save to say that something is missing, and says a clash or a length at once", () => {
    expect(problemWith(draft({ frOne: "" }))).toMatchObject({ error: "ingredientEmpty", live: false });
    expect(problemWith(draft({ gender: "" }))).toMatchObject({ error: "ingredientGender", live: false });
    expect(problemWith(draft({ enOne: "x".repeat(70) }))).toMatchObject({ error: "ingredientTooLong", live: true });
    expect(problemWith(draft({ enOne: "Garlic" }))).toMatchObject({ error: "ingredientTaken", vars: { form: "Garlic", other: "garlic" }, live: true });
    expect(problemWith(draft({ frOne: "Échalote" }))).toMatchObject({ error: "ingredientTaken", live: true });
  });

  it("says a name is taken as soon as it is typed, before the other side is filled in", () => {
    const empty = { enOne: "", enOther: "", frOne: "", frOther: "", gender: "", always: false };
    expect(problemWith({ ...empty, enOne: "garlic" })).toMatchObject({ error: "ingredientTaken", vars: { form: "garlic" }, live: true });
    expect(problemWith({ ...empty, frOne: "gousse d'ail" })).toMatchObject({ error: "ingredientTaken", live: true });
    expect(problemWith({ ...empty, enOne: "zorblax" })).toMatchObject({ error: "ingredientEmpty", live: false });
    expect(problemWith(empty)).toMatchObject({ error: "ingredientEmpty", live: false });
  });

  it("lets a row keep its own names when it is changed, but not take another row's", () => {
    const row = ingredientRows.find((r) => r.key === "garlic clove");
    expect(problemWith(draftForRow(row), { replaces: row.key })).toBeNull();
    expect(problemWith({ ...draftForRow(row), enOne: "onion" }, { replaces: row.key })).toMatchObject({ error: "ingredientTaken" });
  });

  it("counts the changes already kept, except the one being changed", () => {
    const kept = { id: "a1", replaces: null, hidden: false, enOne: "biryani masala", enOther: "=", frOne: "masala biryani", frOther: "=", gender: "m" };
    expect(problemWith(draft(), { overrides: [kept] })).toMatchObject({ error: "ingredientTaken" });
    expect(problemWith(draft(), { overrides: [kept], self: kept })).toBeNull();
  });
});

describe("every row and where it stands", () => {
  const replaced = { id: "r1", replaces: "garlic clove", hidden: false, enOne: "clove of garlic", enOther: "cloves of garlic", frOne: "caïeu d'ail", frOther: "caïeux d'ail", gender: "m", updatedAt: "2026-10-23T12:00:00.000Z" };
  const hidden = { id: "h1", replaces: "shallot", hidden: true, enOne: "", enOther: "", frOne: "", frOther: "", gender: "", updatedAt: "2026-10-24T12:00:00.000Z" };
  const added = { id: "a1", ref: "added:a1", replaces: null, hidden: false, enOne: "biryani masala", enOther: "=", frOne: "masala biryani", frOther: "=", gender: "m", updatedAt: "2026-10-22T12:00:00.000Z" };
  const cards = cardRows(ingredientRows, [replaced, hidden, added]);

  it("has the built-in rows, then the added ingredients", () => {
    expect(cards).toHaveLength(ingredientRows.length + 1);
    expect(cards.find((c) => c.ref === "built:onion").status).toBe("built-in");
    expect(cards.at(-1)).toMatchObject({ status: "added", ref: "added:a1", built: null });
  });

  it("shows a changed row with its new names and a hidden row with the names it hides", () => {
    const changed = cards.find((c) => c.ref === "built:garlic clove");
    expect(changed.status).toBe("changed");
    expect(rowName(changed.row, "fr")).toBe("caïeu d'ail");
    expect(rowName(changed.built, "fr")).toBe("gousse d'ail");
    const gone = cards.find((c) => c.ref === "built:shallot");
    expect(gone.status).toBe("hidden");
    expect(rowName(gone.row, "fr")).toBe("échalote");
  });

  it("lists Matt's changes newest first", () => {
    expect(changedCards(cards).map((c) => c.ref)).toEqual(["built:shallot", "built:garlic clove", "added:a1"]);
  });

  it("searches every spelling in both languages, accents and capitals ignored", () => {
    const refs = (q) => searchCards(cards, q).map((c) => c.ref);
    expect(refs("GOUSSE D")).not.toContain("built:garlic clove"); // replaced: its French is « caïeu » now
    expect(refs("caieu")).toEqual(["built:garlic clove"]);
    expect(refs("scallion")).toContain("built:green onion");
    expect(refs("echalote")).toEqual(["built:shallot"]);
    expect(refs("masala biryani")).toEqual(["added:a1"]);
    expect(refs("")).toEqual([]);
    expect(refs("   ")).toEqual([]);
    expect(refs("zzzz")).toEqual([]);
  });

  it("finds the rows whose name starts with it, and stops at a limit", () => {
    const names = searchCards(cards, "tomat", 8).map((c) => rowName(c.row, "en"));
    expect(names).toContain("tomato");
    expect(names).toHaveLength(8);
    expect(searchCards(cards, "e", 7)).toHaveLength(7);
  });
});

describe("what the Inventory matcher makes of a draft", () => {
  const draft = (extra = {}) => ({ enOne: "kohlrabi", enOther: "kohlrabis", frOne: "chou-rave", frOther: "choux-raves", gender: "m", always: false, ...extra });

  it("has nothing to say about a new name the matcher does not know yet", () => {
    expect(matcherNotes(draft())).toEqual([]);
    // a longer name made of words it knows, read the same way before and after
    expect(matcherNotes(draft({ enOne: "pomegranate juice", enOther: "", frOne: "jus de grenade", frOther: "" }))).toEqual([]);
  });

  it("has nothing to say about a row that is already there, as it is", () => {
    const row = ingredientRows.find((r) => r.key === "cauliflower");
    expect(matcherNotes(draftForRow(row), { replaces: row.key })).toEqual([]);
  });

  it("says a French spelling is already read as another food, and which", () => {
    // « citron » is lemon to the matcher; a row that said it was lime would change that
    const notes = matcherNotes(draft({ enOne: "lime", enOther: "limes", frOne: "limette verte", frOther: "citron" }), { replaces: null });
    expect(notes).toContainEqual({ kind: "reads", form: "citron", was: "lemon", now: "lime" });
  });

  it("says when the matcher would not take the two names for one food", () => {
    const notes = matcherNotes(draft({ enOne: "juice", enOther: "", frOne: "jus", frOther: "" }));
    expect(notes).toContainEqual({ kind: "different", english: "juice", french: "jus" });
  });

  it("says a spelling is never read: an English word, or a different ingredient in each language", () => {
    expect(matcherNotes(draft({ frOther: "sale" }))).toContainEqual({ kind: "notRead", form: "sale" });
    expect(matcherNotes(draft({ frOther: "raisin" }))).toContainEqual({ kind: "notRead", form: "raisin" });
  });

  it("does not count the row being changed, or the one it replaces, as something the matcher knows", () => {
    const garlic = ingredientRows.find((r) => r.key === "garlic clove");
    const edited = draftForRow(garlic);
    expect(matcherNotes({ ...edited, frOne: "caïeu d'ail/gousse d'ail" }, { replaces: garlic.key })).toEqual([]);
    const override = { id: "r1", replaces: "garlic clove", hidden: false, enOne: "garlic clove", enOther: "garlic cloves", frOne: "caïeu d'ail", frOther: "caïeux d'ail", gender: "m" };
    expect(matcherNotes({ ...edited, frOne: "caïeu d'ail" }, { replaces: garlic.key, overrides: [override], self: override })).toEqual([]);
  });

  it("is empty while the names are not typed yet", () => {
    expect(matcherNotes(draft({ enOne: "", frOne: "" }))).toEqual([]);
    expect(matcherNotes(draft({ enOne: "a|b" }))).toEqual([]);
  });

  it("is refused, not just noted, when a spelling is one of the matcher's own words", () => {
    expect(problemWith(draft({ frOne: "poudre" }))).toMatchObject({ error: "ingredientMatcherWord", vars: { form: "poudre", english: "powder" }, live: true });
  });
});

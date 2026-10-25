import { describe, expect, it } from "vitest";
import { buildFrenchReading, frenchPairs } from "./frenchReading.js";
import { effectiveIngredientRows, ingredientRows } from "./ingredientList.js";
import { describingCells } from "./ingredientList.js";
import { keyOf } from "./ingredientTable.js";
import { EXCEPTIONS_FR, NOT_READ_FR, RULE_WORDS_FR, RULE_WORD_MEANING } from "./matcherWords.js";

// What the Inventory matcher understands in French is built from the table of ingredient names
// (frenchReading.js) and its few own words (matcherWords.js).

const row = (en, fr, extra = {}) => ({ en: { one: [en], other: [en] }, fr: { one: [fr], other: [fr] }, gender: "m", alwaysPlural: false, key: en, ...extra });
const pairs = (rows, describing = []) => new Map(frenchPairs(rows, describing));

describe("the matcher's own words", () => {
  it("are written the way the table folds a name: lower case, no accents, spaces for hyphens and apostrophes", () => {
    for (const [fr] of [...RULE_WORDS_FR, ...EXCEPTIONS_FR]) expect(keyOf(fr), fr).toBe(fr);
    for (const fr of NOT_READ_FR) expect(keyOf(fr), fr).toBe(fr);
  });

  it("have each French word once", () => {
    const keys = RULE_WORDS_FR.map(([fr]) => fr);
    expect(keys.filter((key, i) => keys.indexOf(key) !== i)).toEqual([]);
    expect(RULE_WORD_MEANING.get("poudre")).toBe("powder");
  });

  it("are not names the built-in table gives to an ingredient", () => {
    const taken = [];
    for (const r of ingredientRows) for (const number of ["one", "other"]) for (const form of r.fr[number]) if (RULE_WORD_MEANING.has(keyOf(form))) taken.push(form);
    expect(taken).toEqual([]);
  });
});

describe("the French pairs", () => {
  it("give every French spelling of a row, singular and plural, accents folded, as the row's first English name", () => {
    const p = pairs([row("Banana", "banane", { fr: { one: ["banane"], other: ["bananes"] } }), row("garlic clove", "gousse d'ail"), row("cauliflower", "chou-fleur")]);
    expect(p.get("banane")).toBe("banana");
    expect(p.get("bananes")).toBe("banana");
    expect(p.get("gousse d ail")).toBe("garlic clove");
    expect(p.get("chou fleur")).toBe("cauliflower");
  });

  it("read only French: a row's other English spellings are not read", () => {
    const p = pairs([{ ...row("cilantro", "coriandre"), en: { one: ["cilantro", "coriander"], other: ["cilantro", "coriander"] } }]);
    expect(p.get("coriandre")).toBe("cilantro");
    expect(p.has("coriander")).toBe(false);
    expect(p.has("cilantro")).toBe(false);
  });

  it("give the matcher's own words and the exceptions ahead of the table, and Matt's rows ahead of the built-in ones", () => {
    const p = pairs([row("talc", "poudre"), row("roast beef", "rôti"), row("kiwi", "kiwi"), row("kiwifruit", "kiwi")]);
    expect(p.get("poudre")).toBe("powder");
    expect(p.get("roti")).toBe("roast");
    expect(p.get("kiwi")).toBe("kiwi");
    expect(p.get("raisins")).toBe("grapes");
  });

  it("leave out a spelling that is a different ingredient in each language, and the words never read", () => {
    const p = pairs([row("grape", "raisin"), row("raisin", "raisin sec"), row("tea", "thé"), row("sale item", "sale")]);
    expect(p.has("raisin")).toBe(false);
    expect(p.get("raisins")).toBe("grapes"); // the exception keeps its old reading
    expect(p.get("raisin sec")).toBe("raisin");
    expect(p.has("the")).toBe(false);
    expect(p.has("sale")).toBe(false);
  });

  it("read the table's describing words after its ingredients", () => {
    const p = pairs([row("red onion", "oignon violet", { fr: { one: ["rouges"], other: ["rouges"] } })], [["red", "rouge", "rouge", "rouges", "rouges", "colour"]]);
    expect(p.get("rouges")).toBe("red onion"); // a row's spelling is ahead of a describing word
    expect(p.get("rouge")).toBe("red");
  });

  it("read the whole built-in table and a change on top of it", () => {
    const built = pairs(effectiveIngredientRows(), describingCells());
    expect(built.get("banane")).toBe("banana");
    expect(built.get("oignons rouges")).toBeUndefined(); // « rouges » is a describing word, not a row
    expect(built.get("rouges")).toBe("red");
    expect(built.size).toBeGreaterThan(500);
  });
});

describe("the lookups", () => {
  it("put the longest phrase first and find it with spaces or hyphens", () => {
    const reading = buildFrenchReading([row("cauliflower", "chou-fleur"), row("cabbage", "chou")]);
    expect(reading.words.get("chou")).toBe("cabbage");
    expect("un chou-fleur et un chou fleur".replace(reading.phraseRe, (m) => `<${reading.phraseMap.get(m.replace(/[- ]/g, ""))}>`)).toBe("un <cauliflower> et un <cauliflower>");
  });

  it("have no phrase pattern when there is no phrase", () => {
    expect(buildFrenchReading([], []).phraseRe).not.toBeNull(); // the matcher's own phrases (« sans sel »)
    expect(buildFrenchReading([], []).words.get("poudre")).toBe("powder");
  });
});

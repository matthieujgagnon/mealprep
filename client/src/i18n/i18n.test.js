// Guards for the bilingual app: French and English always have the same
// texts, every text the code asks for exists, and no screen has English
// typed straight into it (it would show in French too).
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { en } from "./en.js";
import { fr } from "./fr.js";
import { SRC, hardCodedTexts, sourceFiles } from "./scan.js";

const PLURAL_FORMS = new Set(["zero", "one", "two", "few", "many", "other"]);

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    const isPlural =
      v &&
      typeof v === "object" &&
      "other" in v &&
      Object.keys(v).every((k) => PLURAL_FORMS.has(k)) &&
      Object.values(v).every((x) => typeof x === "string");
    if (v && typeof v === "object" && !Array.isArray(v) && !isPlural) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const vars = (s) => new Set([...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
const textsOf = (v) => (typeof v === "string" ? [v] : Array.isArray(v) ? v : Object.values(v));

const FLAT_EN = flatten(en);
const FLAT_FR = flatten(fr);

describe("translations", () => {
  it("French and English have exactly the same keys", () => {
    expect(Object.keys(FLAT_FR).filter((k) => !(k in FLAT_EN))).toEqual([]);
    expect(Object.keys(FLAT_EN).filter((k) => !(k in FLAT_FR))).toEqual([]);
  });

  it("every text is filled in, and both languages use the same {placeholders}", () => {
    const problems = [];
    for (const [key, enVal] of Object.entries(FLAT_EN)) {
      const frVal = FLAT_FR[key];
      if (frVal == null) continue;
      if (typeof enVal !== typeof frVal || Array.isArray(enVal) !== Array.isArray(frVal)) {
        problems.push(`${key}: different shapes`);
        continue;
      }
      const enTexts = textsOf(enVal);
      const frTexts = textsOf(frVal);
      if (Array.isArray(enVal) && enVal.length !== frVal.length) problems.push(`${key}: lists differ in length`);
      for (const s of [...enTexts, ...frTexts]) if (typeof s !== "string" || s.trim() === "") problems.push(`${key}: empty text`);
      const enVars = new Set(enTexts.flatMap((s) => [...vars(s)]));
      const frVars = new Set(frTexts.flatMap((s) => [...vars(s)]));
      const diff = [...enVars].filter((v) => !frVars.has(v)).concat([...frVars].filter((v) => !enVars.has(v)));
      if (diff.length) problems.push(`${key}: placeholders differ (${diff.join(", ")})`);
      if (typeof enVal === "object" && !Array.isArray(enVal)) {
        if (!("other" in enVal) || !("other" in frVal) || !("one" in frVal)) problems.push(`${key}: plural needs one/other`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("French isn't just English left in place", () => {
    // Words written the same in both languages (and names, units, symbols).
    const SAME = new Set(
      ("note notes total minimum maximum portions portion info options option photo photos message service section " +
        "sections menu date instructions description pause stop ok max min h g kg lb ml oz l flipp gemini metro maxi " +
        "iga provigo super c adonis walmart costco statcan le rabais fr en points simple restaurant collation " +
        "minute minutes nature type format application ingrédients ingredients suggestions suggestion volume carton cartons auto").split(" ")
    );
    const same = Object.entries(FLAT_EN)
      .filter(([k]) => !k.startsWith("same."))
      .filter(([k, v]) => {
        const fr = FLAT_FR[k];
        if (JSON.stringify(v) !== JSON.stringify(fr)) return false;
        const words = textsOf(v).join(" ").replace(/\{\w+\}/g, " ").toLowerCase().match(/\p{L}+/gu) || [];
        return words.some((w) => !SAME.has(w));
      })
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
    expect(same).toEqual([]);
  });

  it("every key the code asks for exists", () => {
    const missing = [];
    for (const file of sourceFiles(SRC).filter((f) => !f.includes(`${path.sep}i18n${path.sep}`))) {
      const src = fs.readFileSync(file, "utf8");
      for (const m of src.matchAll(/\b(?:t|tx)\(\s*["'`]([\w.]+)["'`]/g)) {
        const key = m[1];
        if (!(key in FLAT_EN) && !(key in FLAT_FR)) missing.push(`${path.relative(SRC, file)}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("no English typed straight into a screen", () => {
  const files = sourceFiles(SRC).filter((f) => f.endsWith(".jsx"));
  it.each(files.map((f) => [path.relative(SRC, f), f]))("%s", (_, file) => {
    expect(hardCodedTexts(file)).toEqual([]);
  });
});

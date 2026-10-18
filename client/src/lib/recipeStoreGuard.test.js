import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { SRC, sourceFiles } from "../i18n/scan.js";

// A recipe lives in one place, the recipe store (lib/recipeStore.js), and a planned meal
// shows it through `useLiveEntries`. These guards keep it that way: a page that reads meals
// from the server and uses them as they came would keep its own copy of every recipe, and
// show an edited or deleted one as it was until the page is reloaded.

const files = sourceFiles().map((file) => ({ name: path.relative(SRC, file), src: fs.readFileSync(file, "utf8") }));
const called = (src, fn) => new RegExp(`\\b${fn}\\(`).test(src);

describe("the recipe store is the one place a recipe lives", () => {
  it("every file that reads planned meals from the server reads them through useLiveEntries", () => {
    const reads = files.filter(
      (f) => f.name !== "api.js" && (called(f.src, "listPlanner") || called(f.src, "listPlannerUpcoming"))
    );
    expect(reads.map((f) => f.name).sort()).toEqual([
      "App.jsx",
      "components/GroceryList.jsx",
      "components/Home.jsx",
      "components/Planner.jsx",
      "components/SlotPicker.jsx",
    ]);
    for (const f of reads) expect(f.src, `${f.name} reads meals without useLiveEntries`).toMatch(/\buseLiveEntries\(/);
  });

  it("the recipes list is read once, by App.jsx, and goes straight into the store", () => {
    const reads = files.filter((f) => f.name !== "api.js" && called(f.src, "listRecipes"));
    expect(reads.map((f) => f.name)).toEqual(["App.jsx"]);
    expect(reads[0].src).toMatch(/listRecipes\(\)\.then\(loadRecipes\)/);
  });

  it("no page keeps its own list of recipes in state", () => {
    const own = files.filter((f) => /const \[recipes, setRecipes\]/.test(f.src));
    expect(own.map((f) => f.name)).toEqual([]);
  });
});

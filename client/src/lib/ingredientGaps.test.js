import { describe, expect, it } from "vitest";
import { gapLines, ingredientGaps } from "./ingredientGaps.js";

const recipe = (id, ingredients) => ({ id, title: id, ingredients: ingredients.map(([name, notes]) => ({ name, notes: notes || null })) });

const recipes = [
  recipe("a", [["red onions", "finely chopped"], ["Biryani masala", "toasted"], ["garlic", "cut like a pro"]]),
  recipe("b", [["biryani masala"], ["Pâte de piment fort"], ["onions"]]),
  recipe("c", [["Biryani Masala"], ["Pâte de piment fort"], ["Schnitzel crumbs"]]),
];

describe("the ingredients with no translation yet", () => {
  const gaps = ingredientGaps(recipes);

  it("lists each name once, however it is written, with the recipes that use it, most used first", () => {
    expect(gaps.names).toEqual([
      { name: "Biryani masala", recipes: 3 },
      { name: "Pâte de piment fort", recipes: 2 },
      { name: "Schnitzel crumbs", recipes: 1 },
    ]);
  });

  it("leaves out every name the table knows, in either language", () => {
    const names = gaps.names.map((n) => n.name);
    expect(names).not.toContain("red onions");
    expect(names).not.toContain("garlic");
  });

  it("lists a note with a word the table does not know", () => {
    expect(gaps.notes).toEqual([{ name: "cut like a pro", recipes: 1 }]);
  });

  it("counts the different names in all", () => {
    expect(gaps.total).toBe(6);
  });

  it("is empty for no recipes", () => {
    expect(ingredientGaps([])).toEqual({ names: [], notes: [], total: 0 });
  });
});

describe("the list as lines to fill in", () => {
  it("puts a name on the side it is written in and leaves the other empty, with a comment the table ignores", () => {
    const text = gapLines(ingredientGaps(recipes));
    expect(text).toContain("Biryani masala |  |  |  |  # 3 recipes");
    expect(text).toContain(" |  | Pâte de piment fort |  |  # 2 recipes");
    expect(text).toContain("Schnitzel crumbs |  |  |  |  # 1 recipe");
    expect(text).toContain("cut like a pro |  |  |  |  # 1 recipe");
    expect(text.split("\n")[0]).toMatch(/^# \[ingredients\]/);
  });

  it("is nothing when nothing is missing", () => {
    expect(gapLines({ names: [], notes: [] })).toBe("");
  });
});

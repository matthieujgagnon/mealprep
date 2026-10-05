import { describe, expect, it } from "vitest";
import { entriesToCopy } from "./copyWeek.js";

const e = (dayOfWeek, mealType, recipeId, position = 0) => ({ dayOfWeek, mealType, recipeId, position });

describe("entriesToCopy", () => {
  it("copies every placement onto an empty week", () => {
    const source = [e(0, "dinner", "a"), e(1, "lunch", "b")];
    expect(entriesToCopy(source, [])).toEqual(source);
  });

  it("never fills a slot that is taken, even by a different recipe", () => {
    const source = [e(0, "dinner", "a"), e(1, "lunch", "b"), e(2, "lunch", "c")];
    const target = [e(0, "dinner", "other"), e(2, "lunch", "c")];
    expect(entriesToCopy(source, target)).toEqual([e(1, "lunch", "b")]);
  });

  it("copies one thing per slot", () => {
    const source = [e(0, "dinner", "b", 1), e(0, "dinner", "a", 0)];
    expect(entriesToCopy(source, []).map((x) => x.recipeId)).toEqual(["a"]);
  });
});

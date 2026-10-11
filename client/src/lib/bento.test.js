import { describe, expect, it } from "vitest";
import { bentoLayout, bentoPlacement, bentoTitleSize } from "./bento.js";

const shape = (layout) => layout.map((t) => `${t.cols}x${t.rows}`);

describe("the Cookbook's bento pattern", () => {
  it("is the design's 8 tiles, 34 / 18 / 18 / 26 / 26 / 26 / 18 / 30", () => {
    const layout = bentoLayout(8);
    expect(shape(layout)).toEqual(["2x2", "1x1", "1x1", "2x1", "1x2", "2x1", "1x1", "3x1"]);
    expect(layout.map((t) => t.title)).toEqual([34, 18, 18, 26, 26, 26, 18, 30]);
  });

  it("fills 4 columns by 4 rows with no gap", () => {
    expect(bentoPlacement(bentoLayout(8))).toMatchObject({ rows: 4, empty: 0 });
  });

  it("repeats every 8 recipes", () => {
    const layout = bentoLayout(19);
    expect(shape(layout.slice(8, 16))).toEqual(shape(bentoLayout(8)));
    expect(bentoPlacement(bentoLayout(16))).toMatchObject({ rows: 8, empty: 0 });
  });

  it("makes the first result the big tile, whatever the count", () => {
    for (let n = 1; n <= 40; n++) {
      const first = bentoLayout(n)[0];
      expect(first.rows).toBe(2);
      expect(first.cols).toBeGreaterThanOrEqual(2);
      expect(first.title).toBe(34);
    }
  });

  it("has nothing for no recipes", () => {
    expect(bentoLayout(0)).toEqual([]);
    expect(bentoPlacement([])).toMatchObject({ rows: 0, empty: 0 });
  });

  it("closes the last, incomplete group so there is never a gap, for any count", () => {
    for (let n = 1; n <= 60; n++) {
      const placed = bentoPlacement(bentoLayout(n));
      expect(placed.empty, `${n} recipes`).toBe(0);
      expect(placed.tiles).toHaveLength(n);
    }
  });

  it("stretches the last tiles as agreed", () => {
    expect(shape(bentoLayout(1))).toEqual(["4x2"]);
    expect(shape(bentoLayout(2))).toEqual(["2x2", "2x2"]);
    expect(shape(bentoLayout(3))).toEqual(["2x2", "2x1", "2x1"]);
    expect(shape(bentoLayout(4))).toEqual(["2x2", "1x1", "1x1", "2x1"]);
    expect(shape(bentoLayout(5))).toEqual(["2x2", "1x1", "1x1", "2x1", "4x1"]);
    expect(shape(bentoLayout(6))).toEqual(["2x2", "1x1", "1x1", "2x1", "1x2", "3x2"]);
    expect(shape(bentoLayout(7))).toEqual(["2x2", "1x1", "1x1", "2x1", "1x2", "2x2", "1x2"]);
    expect(shape(bentoLayout(11))).toEqual([...shape(bentoLayout(8)), "2x2", "2x1", "2x1"]);
  });

  it("sizes the title by the tile: 1x1 18, 2x1 or 1x2 26, 3x1 or 4x1 30, bigger 34", () => {
    expect(bentoTitleSize(1, 1)).toBe(18);
    expect(bentoTitleSize(2, 1)).toBe(26);
    expect(bentoTitleSize(1, 2)).toBe(26);
    expect(bentoTitleSize(3, 1)).toBe(30);
    expect(bentoTitleSize(4, 1)).toBe(30);
    expect(bentoTitleSize(2, 2)).toBe(34);
    expect(bentoTitleSize(3, 2)).toBe(34);
    expect(bentoTitleSize(4, 2)).toBe(34);
  });
});

import { describe, expect, it } from "vitest";
import { gridShifts } from "./reorderGrid.js";

// A 12-column grid 1186px wide with 14px gaps: a column is 86px, so a Half is
// 6 columns = 586px, a Third is 4 = 386px and a Full is 1186px.
const COLUMNS = 12;
const GAP = 14;
const WIDTH = 1186;
const COL = (WIDTH - GAP * (COLUMNS - 1)) / COLUMNS;
const w = (span) => span * COL + (span - 1) * GAP;

// Shelves with these widths (in columns) and heights, laid out the way the grid does.
function layout(shelves) {
  let col = 0;
  let row = 0;
  const rowTop = [0];
  const rects = [];
  for (const { span, height } of shelves) {
    if (col + span > COLUMNS) {
      col = 0;
      row += 1;
    }
    rowTop[row] ??= 0;
    rects.push({ span, height, col, row });
    col += span;
  }
  const rowHeight = [];
  rects.forEach((r) => (rowHeight[r.row] = Math.max(rowHeight[r.row] ?? 0, r.height)));
  let y = 0;
  rowHeight.forEach((h, r) => {
    rowTop[r] = y;
    y += h + GAP;
  });
  return rects.map((r) => ({ left: 20 + r.col * (COL + GAP), top: 100 + rowTop[r.row], width: w(r.span), height: r.height }));
}
const move = (shelves, activeIndex, overIndex) =>
  gridShifts({ rects: layout(shelves), activeIndex, overIndex, columns: COLUMNS, gap: GAP, containerWidth: WIDTH });
const moved = (rects, shifts, i) => ({ left: rects[i].left + shifts[i].x, top: rects[i].top + shifts[i].y });

describe("gridShifts", () => {
  it("moves nothing while the carried section is over its own place", () => {
    const shelves = [{ span: 6, height: 200 }, { span: 6, height: 200 }, { span: 12, height: 100 }];
    for (const s of move(shelves, 1, 1)) expect(s).toEqual({ x: 0, y: 0 });
  });

  it("puts every section where the grid will put it once the order changes", () => {
    // Fridge and Freezer (Half), Pantry and Leftovers (Full): Pantry goes first.
    const shelves = [
      { span: 6, height: 200 },
      { span: 6, height: 260 },
      { span: 12, height: 120 },
      { span: 12, height: 90 },
    ];
    const rects = layout(shelves);
    const shifts = move(shelves, 2, 0);
    // The order is now Pantry, Fridge, Freezer, Leftovers.
    const after = layout([shelves[2], shelves[0], shelves[1], shelves[3]]);
    const expected = [after[1], after[2], after[0], after[3]]; // by original index
    shelves.forEach((_, i) => {
      const at = moved(rects, shifts, i);
      expect(at.left).toBeCloseTo(expected[i].left, 5);
      expect(at.top).toBeCloseTo(expected[i].top, 5);
    });
  });

  it("wraps a section onto the next row when it no longer fits, and keeps each width", () => {
    // Three Thirds fill a row; a Half carried to the front pushes the last Third down.
    const shelves = [
      { span: 4, height: 150 },
      { span: 4, height: 150 },
      { span: 4, height: 150 },
      { span: 6, height: 180 },
    ];
    const rects = layout(shelves);
    const shifts = move(shelves, 3, 0);
    const after = layout([shelves[3], shelves[0], shelves[1], shelves[2]]);
    // Half (6) + Third (4) fit on row 1; the next Third (4) does not and wraps.
    const order = [3, 0, 1, 2];
    order.forEach((original, place) => {
      const at = moved(rects, shifts, original);
      expect(at.left).toBeCloseTo(after[place].left, 5);
      expect(at.top).toBeCloseTo(after[place].top, 5);
    });
    expect(after[3].top).toBeGreaterThan(after[0].top);
  });

  it("is a plain list when every section is a full row (a phone)", () => {
    const shelves = [{ span: 12, height: 100 }, { span: 12, height: 300 }, { span: 12, height: 50 }];
    const rects = layout(shelves);
    const shifts = move(shelves, 0, 2);
    // Order 1, 2, 0: 1 moves up by the height of 0 and the gap, 2 follows, 0 goes last.
    expect(shifts[1].y).toBeCloseTo(-(100 + GAP));
    expect(shifts[2].y).toBeCloseTo(-(100 + GAP));
    expect(shifts[0].y).toBeCloseTo(300 + GAP + 50 + GAP);
    for (const s of shifts) expect(s.x).toBeCloseTo(0);
    expect(rects).toHaveLength(3);
  });

  it("gives no shift for an index it cannot place", () => {
    const shelves = [{ span: 6, height: 100 }, { span: 6, height: 100 }];
    for (const s of move(shelves, 0, 5)) expect(s).toEqual({ x: 0, y: 0 });
    for (const s of move(shelves, -1, 0)) expect(s).toEqual({ x: 0, y: 0 });
  });
});

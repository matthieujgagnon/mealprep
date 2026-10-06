import { afterEach, describe, expect, it } from "vitest";
import { CARD_H, COL_W, EDGE, INLINE_PLANNED_H, STEP, boardGeometry, clampPage, dayX, notchLeft, pageAfterSwipe, pageStickers, roundedPolygon, trackX, weekendBands } from "./plannerPhone.js";
import { formatWeekRangeLong } from "./dates.js";
import { setLang } from "../i18n/index.js";

afterEach(() => setLang("en"));

describe("the track", () => {
  it("puts three days in view on each page, so every page has three", () => {
    // Page starts are days 0, 3 and 4 (Mon–Wed, Thu–Sat, Fri–Sun).
    expect([0, 1, 2].map((p) => trackX(p))).toEqual([0, -3 * STEP, -4 * STEP]);
    // The first day of a page sits at the left margin.
    expect([0, 1, 2].map((p) => dayX([0, 3, 4][p]) + trackX(p))).toEqual([EDGE, EDGE, EDGE]);
    // About 40px of the next day peeks at the right edge of a 390px phone.
    expect(390 - dayX(3)).toBe(40);
  });

  it("follows a finger that is down", () => {
    expect(trackX(1, -40)).toBe(-3 * STEP - 40);
  });

  it("changes page only for a swipe past 50px, one page at a time, never past the ends", () => {
    expect(pageAfterSwipe(0, -49)).toBe(0);
    expect(pageAfterSwipe(0, -51)).toBe(1);
    expect(pageAfterSwipe(1, 80)).toBe(0);
    expect(pageAfterSwipe(0, 120)).toBe(0);
    expect(pageAfterSwipe(2, -200)).toBe(2);
    expect(clampPage(-1)).toBe(0);
    expect(clampPage(9)).toBe(2);
  });
});

describe("page stickers", () => {
  it("read the real days of the page they go to", () => {
    setLang("fr");
    expect(pageStickers(0)).toEqual({ back: null, forward: "jeu–sam →" });
    expect(pageStickers(1)).toEqual({ back: "← lun–mer", forward: "ven–dim →" });
    expect(pageStickers(2)).toEqual({ back: "← jeu–sam", forward: null });
  });
  it("read in English too", () => {
    expect(pageStickers(1)).toEqual({ back: "← Mon–Wed", forward: "Fri–Sun →" });
  });
});

describe("the board's rows", () => {
  it("has three rows and the Vider row, with no card open", () => {
    const g = boardGeometry(null);
    expect(g.rowTop(0)).toBe(6 + 44 + 6 + 18);
    expect(g.rowTop(1) - g.rowTop(0)).toBe(CARD_H + 6 + 18);
    expect(g.labelTop(1)).toBe(g.rowTop(1) - 18);
    expect(g.height).toBe(g.viderTop + 30);
  });

  it("pushes the rows below an open card down, and the names with them", () => {
    const closed = boardGeometry(null);
    const open = boardGeometry({ meal: 0, height: INLINE_PLANNED_H });
    expect(open.rowTop(0)).toBe(closed.rowTop(0));
    expect(open.insertTop).toBe(closed.rowTop(0) + CARD_H + 6);
    expect(open.rowTop(1)).toBe(closed.rowTop(1) + INLINE_PLANNED_H + 6);
    expect(open.rowTop(2)).toBe(closed.rowTop(2) + INLINE_PLANNED_H + 6);
    expect(open.labelTop(1)).toBe(open.rowTop(1) - 18);
    expect(open.height).toBe(closed.height + INLINE_PLANNED_H + 6);
  });

  it("leaves the rows above an open card alone", () => {
    const closed = boardGeometry(null);
    const open = boardGeometry({ meal: 2, height: 112 });
    expect(open.rowTop(0)).toBe(closed.rowTop(0));
    expect(open.rowTop(1)).toBe(closed.rowTop(1));
    expect(open.rowTop(2)).toBe(closed.rowTop(2));
    expect(open.viderTop).toBe(closed.viderTop + 112 + 6);
  });

  it("points the notch at the slot, inside the card", () => {
    expect(notchLeft(1, 0)).toBe(dayX(1) + COL_W / 2 - EDGE - 7);
    expect(notchLeft(0, 0)).toBe(Math.max(14, dayX(0) + COL_W / 2 - EDGE - 7));
    expect(notchLeft(6, 2)).toBeLessThanOrEqual(390 - 2 * EDGE - 32);
  });
});

describe("the weekend band", () => {
  const geo = boardGeometry(null);
  it("is one rounded outline for each run, none when it is off", () => {
    expect(weekendBands({ on: true, days: [5, 6], eve: false }, geo)).toHaveLength(1);
    expect(weekendBands({ on: true, days: [3, 5], eve: false }, geo)).toHaveLength(2);
    expect(weekendBands({ on: false, days: [5, 6], eve: true }, geo)).toEqual([]);
    expect(weekendBands({ on: true, days: [], eve: true }, geo)).toEqual([]);
  });

  it("takes in the evening before as an L with six corners", () => {
    const plain = weekendBands({ on: true, days: [5, 6], eve: false }, geo)[0].d;
    const withEve = weekendBands({ on: true, days: [5, 6], eve: true }, geo)[0].d;
    expect((plain.match(/Q/g) || []).length).toBe(4);
    expect((withEve.match(/Q/g) || []).length).toBe(6);
  });

  it("does not take in an evening before Monday", () => {
    const d = weekendBands({ on: true, days: [0, 1], eve: true }, geo)[0].d;
    expect((d.match(/Q/g) || []).length).toBe(4);
  });

  it("follows the rows when a card pushes them down", () => {
    const open = boardGeometry({ meal: 0, height: 150 });
    expect(weekendBands({ on: true, days: [5, 6], eve: false }, open)[0].d).not.toBe(weekendBands({ on: true, days: [5, 6], eve: false }, geo)[0].d);
  });
});

describe("roundedPolygon", () => {
  it("rounds each corner of a square", () => {
    const d = roundedPolygon([[0, 0], [100, 0], [100, 100], [0, 100]], 10);
    expect(d.startsWith("M0 10Q0 0 10 0")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
  });
});

describe("the date line above the title", () => {
  it("writes the week with whole month names", () => {
    expect(formatWeekRangeLong("2026-10-05")).toBe("October 5 – 11");
    expect(formatWeekRangeLong("2026-09-28")).toBe("September 28 – October 4");
    setLang("fr");
    expect(formatWeekRangeLong("2026-10-05")).toBe("5 – 11 octobre");
    expect(formatWeekRangeLong("2026-09-28")).toBe("28 septembre – 4 octobre");
  });
});

import { describe, expect, it } from "vitest";
import { centerOn, keepInside, placeBeside, WINDOW_MARGIN } from "./placeInWindow.js";

const view = { width: 1280, height: 800 };
const box = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height });
const inside = ({ left, top }, size) =>
  left >= WINDOW_MARGIN && top >= WINDOW_MARGIN && left + size.width <= view.width - WINDOW_MARGIN && top + size.height <= view.height - WINDOW_MARGIN;

describe("keepInside", () => {
  const size = { width: 280, height: 240 };

  it("leaves a box that is already inside where it is", () => {
    expect(keepInside({ left: 300, top: 200 }, size, view)).toEqual({ left: 300, top: 200 });
  });

  it("shifts a box back from each of the four sides, to the margin", () => {
    expect(keepInside({ left: -334, top: 200 }, size, view).left).toBe(WINDOW_MARGIN);
    expect(keepInside({ left: 1200, top: 200 }, size, view).left).toBe(1280 - 280 - WINDOW_MARGIN);
    expect(keepInside({ left: 300, top: -50 }, size, view).top).toBe(WINDOW_MARGIN);
    expect(keepInside({ left: 300, top: 700 }, size, view).top).toBe(800 - 240 - WINDOW_MARGIN);
  });

  it("starts a box bigger than the window at the margin", () => {
    expect(keepInside({ left: 400, top: 400 }, { width: 2000, height: 2000 }, view)).toEqual({ left: WINDOW_MARGIN, top: WINDOW_MARGIN });
  });
});

describe("placeBeside", () => {
  const size = { width: 280, height: 240 };

  it("goes on the preferred side when it fits", () => {
    const anchor = box(500, 225, 350, 470);
    expect(placeBeside({ anchor, size, view, prefer: "left" })).toEqual({ left: 500 - 16 - 280, top: 225, side: "left" });
    expect(placeBeside({ anchor, size, view, prefer: "right" })).toEqual({ left: 850 + 16, top: 225, side: "right" });
  });

  it("flips to the other side when the preferred one runs out of window", () => {
    // The week calendar's own place at the left of the window: no room to its left.
    const atLeft = box(12, 225, 350, 470);
    expect(placeBeside({ anchor: atLeft, size, view, prefer: "left" })).toEqual({ left: 362 + 16, top: 225, side: "right" });
    // And near the right edge, none to its right.
    const atRight = box(900, 225, 350, 470);
    expect(placeBeside({ anchor: atRight, size, view, prefer: "right" }).side).toBe("left");
  });

  it("keeps the box inside the window above and below as well", () => {
    expect(placeBeside({ anchor: box(500, -100, 350, 470), size, view, prefer: "left" }).top).toBe(WINDOW_MARGIN);
    expect(placeBeside({ anchor: box(500, 700, 350, 470), size, view, prefer: "left" }).top).toBe(800 - 240 - WINDOW_MARGIN);
  });

  it("lines its bottom up with the anchor's when asked", () => {
    const anchor = box(100, 300, 150, 150);
    expect(placeBeside({ anchor, size, view, align: "bottom" }).top).toBe(450 - 240);
  });

  it("flips against a limit, as the slot cards do against the board", () => {
    const anchor = box(900, 300, 150, 150);
    const board = { left: 40, right: 1240 };
    expect(placeBeside({ anchor, size: { width: 440, height: 300 }, view, limit: board }).side).toBe("left");
    expect(placeBeside({ anchor: box(160, 300, 150, 150), size: { width: 440, height: 300 }, view, limit: board }).side).toBe("right");
  });

  it("never leaves the window, wherever the anchor is and at any window width from 768 up", () => {
    for (const width of [768, 900, 1100, 1280, 1920]) {
      const v = { width, height: 700 };
      for (const left of [-40, 0, 12, 200, width / 2, width - 360, width - 100]) {
        for (const top of [-300, 0, 225, 600]) {
          const placed = placeBeside({ anchor: box(left, top, 350, 470), size, view: v, prefer: "left" });
          expect(placed.left).toBeGreaterThanOrEqual(WINDOW_MARGIN);
          expect(placed.top).toBeGreaterThanOrEqual(WINDOW_MARGIN);
          expect(placed.left + size.width).toBeLessThanOrEqual(width - WINDOW_MARGIN);
          expect(placed.top + size.height).toBeLessThanOrEqual(700 - WINDOW_MARGIN);
        }
      }
    }
    expect(inside({ left: 12, top: 12 }, size)).toBe(true);
  });
});

describe("centerOn", () => {
  it("centres on the anchor", () => {
    expect(centerOn(box(600, 150, 120, 34), 350, view)).toBe(600 + 60 - 175);
  });

  it("shifts to the margin when centring would leave the window on the left (the date pill sits at the left)", () => {
    expect(centerOn(box(80, 150, 110, 34), 350, view)).toBe(WINDOW_MARGIN);
  });

  it("shifts back from the right edge", () => {
    expect(centerOn(box(1180, 150, 80, 34), 350, view)).toBe(1280 - 350 - WINDOW_MARGIN);
  });
});

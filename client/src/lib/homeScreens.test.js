import { describe, expect, it } from "vitest";
import { activeScreen, screensFit } from "./homeScreens.js";

describe("activeScreen", () => {
  // A 636px scroller whose second screen starts at 739.
  const at = (scrollTop) => activeScreen({ scrollTop, clientHeight: 636, screen2Top: 739 });

  it("is the first screen at the top", () => {
    expect(at(0)).toBe(0);
  });

  it("switches to the second once half the scroller is past its top", () => {
    expect(at(420)).toBe(0); // 420 + 318 = 738, one short
    expect(at(421)).toBe(1); // 421 + 318 = 739
    expect(at(739)).toBe(1);
  });

  it("is the first screen again when scrolled back up", () => {
    expect(at(1000)).toBe(1);
    expect(at(100)).toBe(0);
  });
});

describe("screensFit", () => {
  it("is true when both screens are no taller than the scroller", () => {
    expect(screensFit({ clientHeight: 816, screenHeights: [816, 816] })).toBe(true);
  });

  it("allows a pixel of rounding", () => {
    expect(screensFit({ clientHeight: 816, screenHeights: [817, 816] })).toBe(true);
    expect(screensFit({ clientHeight: 816, screenHeights: [818, 816] })).toBe(false);
  });

  it("is false when either screen is taller (a short window, a phone)", () => {
    expect(screensFit({ clientHeight: 636, screenHeights: [739, 636] })).toBe(false);
    expect(screensFit({ clientHeight: 556, screenHeights: [1300, 1225] })).toBe(false);
    expect(screensFit({ clientHeight: 700, screenHeights: [700, 900] })).toBe(false);
  });

  it("is false before the scroller has a height", () => {
    expect(screensFit({ clientHeight: 0, screenHeights: [0, 0] })).toBe(false);
  });
});

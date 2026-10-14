import { describe, expect, it } from "vitest";
import { activeScreen, flickStop, screensFit } from "./homeScreens.js";

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

describe("flickStop", () => {
  // A phone: a 664px scroller, screen 2 starting at 1460, so screen 1 ends (fills
  // the scroller's bottom) at 796.
  const stop = (from, top, step) => flickStop({ from, top, step, screen2Top: 1460, clientHeight: 664 });

  it("stops a flick down from screen 1 at the top of screen 2", () => {
    expect(stop(796, 1400, 70)).toBe(1460); // the next step would pass it: stop now
    expect(stop(0, 1300, 200)).toBe(1460); // from the very top, too
    expect(stop(1100, 1455, 10)).toBe(1460); // set off between the screens
  });

  it("brings back a flick down that is already past the top of screen 2", () => {
    expect(stop(796, 1530, 90)).toBe(1460);
  });

  it("lets a flick down run on while it is short of the join", () => {
    expect(stop(796, 1000, 60)).toBeNull();
    expect(stop(796, 1399, 60)).toBeNull(); // 1459: one short
  });

  it("never stops a scroll down that set off inside screen 2", () => {
    expect(stop(1460, 1700, 80)).toBeNull();
    expect(stop(1459, 1600, 80)).toBeNull(); // a pixel of rounding
  });

  it("stops a flick up from screen 2 with the end of screen 1 at the bottom", () => {
    expect(stop(1460, 850, -60)).toBe(796);
    expect(stop(2200, 900, -150)).toBe(796); // from deep in screen 2: it passes the top of screen 2 and stops at the join
    expect(stop(1100, 780, -40)).toBe(796); // set off between the screens, already past
  });

  it("lets a flick up run on while it is short of the join", () => {
    expect(stop(1460, 1200, -100)).toBeNull();
    expect(stop(1460, 857, -60)).toBeNull(); // 797: one short
  });

  it("never stops a scroll up that set off inside screen 1", () => {
    expect(stop(796, 500, -100)).toBeNull();
    expect(stop(797, 500, -100)).toBeNull(); // a pixel of rounding
  });

  it("does nothing without a direction", () => {
    expect(stop(796, 1460, 0)).toBeNull();
  });

  it("stops going up at 0 when screen 1 is no taller than the scroller", () => {
    expect(flickStop({ from: 700, top: 50, step: -60, screen2Top: 600, clientHeight: 664 })).toBe(0);
  });
});

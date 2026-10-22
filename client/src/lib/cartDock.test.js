import { describe, expect, it } from "vitest";
import { dockWanted } from "./cartDock.js";

describe("when the docked cart shows", () => {
  it("shows once the bar has scrolled out of sight above the pinned header", () => {
    expect(dockWanted({ bottom: -2223 }, 108)).toBe(true);
    expect(dockWanted({ bottom: 108 }, 108)).toBe(true); // its bottom edge just at the header's
  });

  it("stays away while the bar is in view", () => {
    expect(dockWanted({ bottom: 300 }, 108)).toBe(false);
    expect(dockWanted({ bottom: 109.5 }, 108)).toBe(false);
  });

  it("stays away while the bar is still below the screen (how the page opens under How it works)", () => {
    expect(dockWanted({ bottom: 886 }, 108)).toBe(false);
  });

  it("is a plain measure of where the bar is, so a jump from below the screen to above it counts too", () => {
    // Before and after a jump of 3000 px: no step in between, the answer follows the bar.
    expect(dockWanted({ bottom: 886 }, 108)).toBe(false);
    expect(dockWanted({ bottom: 886 - 3169 }, 108)).toBe(true);
  });

  it("without a pinned header (a computer, or an unpinned phone) the line is the top of the screen", () => {
    expect(dockWanted({ bottom: -1 }, 0)).toBe(true);
    expect(dockWanted({ bottom: 40 }, 0)).toBe(false);
  });

  it("with no bar there is no dock", () => {
    expect(dockWanted(null, 108)).toBe(false);
  });
});

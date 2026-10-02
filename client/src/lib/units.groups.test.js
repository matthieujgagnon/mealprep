import { describe, expect, it } from "vitest";
import { UNIT_GROUPS, unitLabel, unitOptionLabel } from "./units.js";

describe("the measures list", () => {
  const all = UNIT_GROUPS.flatMap((g) => g.units);

  it("has a block (of cheese) and the other everyday measures, each once", () => {
    for (const u of ["block", "stick", "loaf", "fillet", "portion", "carton", "tub", "leaf"]) expect(all).toContain(u);
    expect(new Set(all).size).toBe(all.length);
  });

  it("reads right next to an amount", () => {
    expect(unitLabel("block", 1)).toBe("block");
    expect(unitLabel("block", 2)).toBe("blocks");
    expect(unitLabel("loaf", 0.5)).toBe("loaf");
    expect(unitLabel("loaf", 2)).toBe("loaves");
    expect(unitLabel("leaf", 4)).toBe("leaves");
    expect(unitLabel("box", 2)).toBe("boxes");
    expect(unitOptionLabel("tub")).toBe("tubs");
  });
});

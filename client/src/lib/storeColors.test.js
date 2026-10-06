import { beforeEach, describe, expect, it, vi } from "vitest";
import { colorOfStore, defaultStoreColor, parseColor, readStoreColors, textOn, writeStoreColors } from "./storeColors.js";
import { makeConfetti } from "./storeConfetti.js";

describe("parseColor", () => {
  it("reads hex, short hex, plain RGB and rgb()", () => {
    expect(parseColor("#ff48b0")).toBe("#FF48B0");
    expect(parseColor("FF48B0")).toBe("#FF48B0");
    expect(parseColor("#f4b")).toBe("#FF44BB");
    expect(parseColor("255, 72, 176")).toBe("#FF48B0");
    expect(parseColor("rgb(255,72,176)")).toBe("#FF48B0");
  });
  it("says no to anything else", () => {
    for (const bad of ["", "pink", "#12", "#GGGGGG", "256, 0, 0", "1, 2", null]) expect(parseColor(bad)).toBeNull();
  });
});

describe("textOn", () => {
  it("picks ink on the light colours and white on the dark ones", () => {
    expect(textOn("#FFE14D")).toBe("#16181F");
    expect(textOn("#10C95C")).toBe("#16181F");
    expect(textOn("#FF48B0")).toBe("#16181F");
    expect(textOn("#2323FF")).toBe("#FFFFFF");
    expect(textOn("#000000")).toBe("#FFFFFF");
  });
});

describe("store colours", () => {
  beforeEach(() => {
    const data = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => data.set(k, String(v)),
      removeItem: (k) => data.delete(k),
    });
  });

  it("start from the design's three and give any other store the same colour every time", () => {
    expect(defaultStoreColor("Metro")).toBe("#FF48B0");
    expect(defaultStoreColor("Super C")).toBe("#FFE14D");
    expect(defaultStoreColor("Fruits du jour")).toBe("#10C95C");
    expect(defaultStoreColor("IGA")).toBe(defaultStoreColor("IGA"));
    expect(parseColor(defaultStoreColor("Provigo"))).not.toBeNull();
  });

  it("are kept on the device, and a saved one wins", () => {
    expect(readStoreColors()).toEqual({});
    writeStoreColors({ Metro: "#2323FF" });
    expect(readStoreColors()).toEqual({ Metro: "#2323FF" });
    expect(colorOfStore(readStoreColors(), "Metro")).toBe("#2323FF");
    expect(colorOfStore(readStoreColors(), "Super C")).toBe("#FFE14D");
    writeStoreColors({});
    expect(localStorage.getItem("mealprep-store-colors")).toBeNull();
  });

  it("ignore a saved value that is not a colour", () => {
    localStorage.setItem("mealprep-store-colors", JSON.stringify({ Metro: "nope", IGA: "#fff" }));
    expect(readStoreColors()).toEqual({ IGA: "#FFFFFF" });
  });
});

describe("makeConfetti", () => {
  it("makes 240 falling and 150 shot-up pieces and 22 sparkles", () => {
    const { pieces, sparkles } = makeConfetti();
    expect(pieces.filter((p) => p.anim === "sm-fall")).toHaveLength(240);
    expect(pieces.filter((p) => /^sm-b[lr]/.test(p.anim))).toHaveLength(150);
    expect(sparkles).toHaveLength(22);
  });
});

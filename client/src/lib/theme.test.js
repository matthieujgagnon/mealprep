import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, LEGACY_THEME_KEY, THEME_KEY, otherTheme, readTheme, writeTheme } from "./theme.js";

// A stand-in for localStorage.
function memory(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
  };
}

const broken = {
  getItem() {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("blocked");
  },
};

describe("readTheme", () => {
  it("is dark until someone picks light", () => {
    expect(DEFAULT_THEME).toBe("dark");
    expect(readTheme(memory())).toBe("dark");
  });

  it("reads the saved choice", () => {
    expect(readTheme(memory({ [THEME_KEY]: "light" }))).toBe("light");
    expect(readTheme(memory({ [THEME_KEY]: "dark" }))).toBe("dark");
  });

  it("keeps the choice Store mode saved before the switch was shared", () => {
    expect(readTheme(memory({ [LEGACY_THEME_KEY]: "light" }))).toBe("light");
  });

  it("prefers the shared choice over the old one", () => {
    expect(readTheme(memory({ [THEME_KEY]: "dark", [LEGACY_THEME_KEY]: "light" }))).toBe("dark");
  });

  it("ignores a value it doesn't know, and storage that can't be read", () => {
    expect(readTheme(memory({ [THEME_KEY]: "sepia" }))).toBe("dark");
    expect(readTheme(broken)).toBe("dark");
    expect(readTheme(null)).toBe("dark");
  });
});

describe("writeTheme", () => {
  it("saves under the shared key, which Store mode and Cook mode both read", () => {
    const storage = memory();
    writeTheme("light", storage);
    expect(storage.data[THEME_KEY]).toBe("light");
    expect(readTheme(storage)).toBe("light");
  });

  it("saves nothing for a value it doesn't know, and never throws", () => {
    const storage = memory();
    writeTheme("sepia", storage);
    expect(storage.data).toEqual({});
    expect(() => writeTheme("dark", broken)).not.toThrow();
    expect(() => writeTheme("dark", null)).not.toThrow();
  });
});

describe("otherTheme", () => {
  it("flips between the two", () => {
    expect(otherTheme("dark")).toBe("light");
    expect(otherTheme("light")).toBe("dark");
  });
});

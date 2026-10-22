import { describe, expect, it } from "vitest";
import { EASE, T, ms, prefersReducedMotion, readSlowmo, slowmo } from "./motion.js";

// A tab's sessionStorage, as far as readSlowmo uses it.
function storage(start = {}) {
  const data = { ...start };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

describe("slow motion is for development only", () => {
  it("is 1 in the built app, whatever the address or the tab says", () => {
    const tab = storage({ "mm.slowmo": "4" });
    expect(readSlowmo({ dev: false, search: "?slowmo=4", storage: tab })).toBe(1);
    expect(readSlowmo({ dev: false, search: "", storage: tab })).toBe(1);
    expect(readSlowmo({ search: "?slowmo=10", storage: tab })).toBe(1); // no `dev` means off
    expect(tab.data).toEqual({ "mm.slowmo": "4" }); // and the built app writes nothing either
  });

  it("reads ?slowmo=N in development and keeps it for the tab", () => {
    const tab = storage();
    expect(readSlowmo({ dev: true, search: "?slowmo=4", storage: tab })).toBe(4);
    expect(tab.data["mm.slowmo"]).toBe("4");
    // Another page of the same tab, no query: still slow.
    expect(readSlowmo({ dev: true, search: "", storage: tab })).toBe(4);
    expect(readSlowmo({ dev: true, search: "?slowmo=2.5", storage: tab })).toBe(2.5);
  });

  it("?slowmo=1 turns it off, and nonsense is ignored", () => {
    const tab = storage({ "mm.slowmo": "4" });
    expect(readSlowmo({ dev: true, search: "?slowmo=1", storage: tab })).toBe(1);
    expect(tab.data).toEqual({});
    expect(readSlowmo({ dev: true, search: "?slowmo=abc", storage: storage() })).toBe(1);
    expect(readSlowmo({ dev: true, search: "?slowmo=0", storage: storage() })).toBe(1);
    expect(readSlowmo({ dev: true, search: "?slowmo=-3", storage: storage() })).toBe(1);
    expect(readSlowmo({ dev: true, search: "?slowmo=", storage: storage() })).toBe(1);
    expect(readSlowmo({ dev: true, search: "", storage: storage({ "mm.slowmo": "junk" }) })).toBe(1);
  });

  it("still works when the tab's storage is blocked", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readSlowmo({ dev: true, search: "?slowmo=4", storage: blocked })).toBe(4);
    expect(readSlowmo({ dev: true, search: "", storage: blocked })).toBe(1);
  });

  it("changes nothing without a window (the factor is 1 and ms is the README's number)", () => {
    expect(slowmo()).toBe(1);
    expect(ms(160)).toBe(160);
  });
});

describe("the README's timings", () => {
  it("add up to the README's totals", () => {
    const end = (steps) => Math.max(...Object.values(steps).map(([delay, duration]) => delay + duration));
    expect(end(T.check)).toBe(580);
    expect(end(T.queue)).toBe(540);
    expect(end(T.back)).toBe(600);
    expect(end(T.storeCheck)).toBe(580);
  });

  it("has the three easings", () => {
    expect(Object.keys(EASE).sort()).toEqual(["linear", "move", "out"]);
  });

  it("the toast's five seconds is real time", () => {
    expect(T.toastLife).toBe(5000);
  });
});

describe("reduced motion", () => {
  it("is off without a window", () => {
    expect(prefersReducedMotion()).toBe(false);
  });
});

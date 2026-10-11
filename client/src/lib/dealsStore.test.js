import { beforeEach, describe, expect, it, vi } from "vitest";

const getRealDeals = vi.fn();
vi.mock("../api.js", () => ({ api: { getRealDeals: (...args) => getRealDeals(...args) } }));

let store;
beforeEach(async () => {
  vi.resetModules();
  getRealDeals.mockReset();
  store = await import("./dealsStore.js");
});

describe("the shared flyer deals", () => {
  it("says a load worked: deals in, not failed", async () => {
    getRealDeals.mockResolvedValue([{ id: "a" }]);
    await store.loadDeals();
    expect(store.dealsState()).toEqual({ deals: [{ id: "a" }], loaded: true, failed: false });
  });

  it("says a load failed, and keeps the deals it already had", async () => {
    getRealDeals.mockResolvedValueOnce([{ id: "a" }]).mockRejectedValueOnce(new Error("offline"));
    await store.loadDeals();
    await store.refreshDeals();
    expect(store.dealsState()).toEqual({ deals: [{ id: "a" }], loaded: true, failed: true });
  });

  it("clears failed on the next good load, and when logging out", async () => {
    getRealDeals.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([{ id: "b" }]);
    await store.loadDeals();
    expect(store.dealsState()).toEqual({ deals: [], loaded: true, failed: true });
    await store.refreshDeals();
    expect(store.dealsState()).toEqual({ deals: [{ id: "b" }], loaded: true, failed: false });
    store.clearDeals();
    expect(store.dealsState()).toEqual({ deals: [], loaded: false, failed: false });
  });
});

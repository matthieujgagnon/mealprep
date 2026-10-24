import { afterEach, describe, expect, it, vi } from "vitest";
import { getIngredientOverrides, ingredientName, setIngredientOverrides } from "./ingredientDisplay.js";
import { createNameSaver } from "./nameSaves.js";

// Saving Matt's changes to the ingredient names: they show at once, go out in order, and come
// back as the server has them when a save fails.

afterEach(() => setIngredientOverrides([]));

const draft = (extra = {}) => ({ enOne: "biryani masala", enOther: "=", frOne: "masala biryani", frOther: "=", gender: "m", ...extra });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// A server that keeps rows, answers when told to, and can be made to fail.
function fakeApi({ fail = false } = {}) {
  const calls = [];
  const rows = new Map();
  let next = 0;
  const api = {
    calls,
    rows,
    failing: fail,
    saveIngredientName: vi.fn(async (body) => {
      calls.push(["POST", body]);
      if (api.failing) throw new Error("no");
      const existing = body.replaces && [...rows.values()].find((r) => r.replaces === body.replaces);
      const row = { ...body, replaces: body.replaces ?? null, id: existing?.id || `s${++next}`, updatedAt: "2026-10-24T12:00:00.000Z", updatedBy: "matt@example.com" };
      rows.set(row.id, row);
      return row;
    }),
    changeIngredientName: vi.fn(async (id, body) => {
      calls.push(["PUT", id, body]);
      if (api.failing) throw new Error("no");
      const row = { ...rows.get(id), ...body, updatedAt: "2026-10-24T12:05:00.000Z" };
      rows.set(id, row);
      return row;
    }),
    deleteIngredientName: vi.fn(async (id) => {
      calls.push(["DELETE", id]);
      if (api.failing) throw new Error("no");
      rows.delete(id);
    }),
  };
  return api;
}

describe("saving a change", () => {
  it("shows at once on every screen, and saves behind it", async () => {
    const api = fakeApi();
    const saver = createNameSaver({ api });
    const { ref } = saver.save(draft());
    expect(ingredientName("biryani masala", "fr")).toBe("masala biryani");
    await flush();
    expect(api.calls).toEqual([["POST", expect.objectContaining({ enOne: "biryani masala", hidden: false })]]);
    const [row] = getIngredientOverrides();
    expect(row).toMatchObject({ ref, id: "s1", updatedBy: "matt@example.com", updatedAt: "2026-10-24T12:00:00.000Z" });
  });

  it("changes the same row the second time, with a PUT on the server's id", async () => {
    const api = fakeApi();
    const saver = createNameSaver({ api });
    const { ref } = saver.save(draft());
    await flush();
    saver.save(draft({ frOne: "masala birianî" }), ref);
    expect(ingredientName("biryani masala", "fr")).toBe("masala birianî");
    await flush();
    expect(api.calls.map((c) => c[0])).toEqual(["POST", "PUT"]);
    expect(api.calls[1][1]).toBe("s1");
    expect(getIngredientOverrides()).toHaveLength(1);
  });

  it("keeps a built-in row's change under that row's own ref, so a second tap changes it again", async () => {
    const api = fakeApi();
    const saver = createNameSaver({ api });
    const one = saver.save(draft({ replaces: "garlic clove", enOne: "garlic clove", frOne: "caïeu d'ail" }));
    const two = saver.save(draft({ replaces: "garlic clove", enOne: "garlic clove", frOne: "caïeu d'ail", gender: "f" }));
    expect(one.ref).toBe("built:garlic clove");
    expect(two.ref).toBe(one.ref);
    expect(getIngredientOverrides()).toHaveLength(1);
    await flush();
    expect(api.rows.size).toBe(1);
  });

  it("sends two quick taps one after the other, and the last one is what the server keeps", async () => {
    const api = fakeApi();
    const saver = createNameSaver({ api });
    const { ref } = saver.save(draft());
    saver.save(draft({ frOne: "second" }), ref);
    saver.save(draft({ frOne: "third" }), ref);
    await flush();
    await flush();
    expect([...api.rows.values()].map((r) => r.frOne)).toEqual(["third"]);
    expect(ingredientName("biryani masala", "fr")).toBe("third");
  });
});

describe("Undo", () => {
  it("of a first save removes the row again", async () => {
    const api = fakeApi();
    const saver = createNameSaver({ api });
    const { ref, before } = saver.save(draft());
    expect(before).toBeNull();
    await flush();
    saver.restore(ref, before);
    expect(ingredientName("biryani masala", "fr")).toBe("biryani masala");
    await flush();
    expect(api.rows.size).toBe(0);
    expect(api.calls.map((c) => c[0])).toEqual(["POST", "DELETE"]);
  });

  it("of a change puts the old names back", async () => {
    const api = fakeApi();
    const saver = createNameSaver({ api });
    const { ref } = saver.save(draft());
    await flush();
    const second = saver.save(draft({ frOne: "après" }), ref);
    await flush();
    saver.restore(ref, second.before);
    expect(ingredientName("biryani masala", "fr")).toBe("masala biryani");
    await flush();
    expect(api.rows.get("s1").frOne).toBe("masala biryani");
  });

  it("of a remove puts the row back, with a new id when the server had let it go", async () => {
    const api = fakeApi();
    const saver = createNameSaver({ api });
    const { ref } = saver.save(draft());
    await flush();
    const before = saver.remove(ref);
    expect(ingredientName("biryani masala", "fr")).toBe("biryani masala");
    await flush();
    expect(api.rows.size).toBe(0);
    saver.restore(ref, before);
    expect(ingredientName("biryani masala", "fr")).toBe("masala biryani");
    await flush();
    expect(api.rows.size).toBe(1);
    expect(getIngredientOverrides()[0].id).toBe([...api.rows.keys()][0]);
  });

  it("of a remove straight after, before the server heard of it, sends nothing for either", async () => {
    const api = fakeApi();
    const saver = createNameSaver({ api });
    const { ref } = saver.save(draft());
    const before = saver.remove(ref);
    saver.restore(ref, before);
    await flush();
    await flush();
    expect(api.rows.size).toBe(1);
  });
});

describe("removing", () => {
  it("brings the built-in row back at once", async () => {
    const api = fakeApi();
    const saver = createNameSaver({ api });
    saver.load([{ id: "r1", replaces: "garlic clove", hidden: false, enOne: "garlic clove", enOther: "garlic cloves", frOne: "caïeu d'ail", frOther: "caïeux d'ail", gender: "m" }]);
    expect(ingredientName("garlic clove", "fr")).toBe("caïeu d'ail");
    saver.remove("built:garlic clove");
    expect(ingredientName("garlic clove", "fr")).toBe("gousse d'ail");
    await flush();
    expect(api.calls).toEqual([["DELETE", "r1"]]);
  });

  it("does nothing for a row that isn't there", () => {
    const api = fakeApi();
    const saver = createNameSaver({ api });
    expect(saver.remove("built:nothing")).toBeNull();
    expect(api.calls).toEqual([]);
  });
});

describe("when the server says no", () => {
  it("puts a new row back out and says so", async () => {
    const api = fakeApi({ fail: true });
    const onFailed = vi.fn();
    const saver = createNameSaver({ api, onFailed });
    saver.save(draft());
    expect(ingredientName("biryani masala", "fr")).toBe("masala biryani");
    await flush();
    expect(ingredientName("biryani masala", "fr")).toBe("biryani masala");
    expect(onFailed).toHaveBeenCalledWith("save", expect.any(Error));
  });

  it("puts a changed row back the way the server has it", async () => {
    const api = fakeApi();
    const onFailed = vi.fn();
    const saver = createNameSaver({ api, onFailed });
    const { ref } = saver.save(draft());
    await flush();
    api.failing = true;
    saver.save(draft({ frOne: "refusé" }), ref);
    await flush();
    expect(ingredientName("biryani masala", "fr")).toBe("masala biryani");
    expect(onFailed).toHaveBeenCalledTimes(1);
  });

  it("puts a removed row back", async () => {
    const api = fakeApi();
    const onFailed = vi.fn();
    const saver = createNameSaver({ api, onFailed });
    const { ref } = saver.save(draft());
    await flush();
    api.failing = true;
    saver.remove(ref);
    expect(ingredientName("biryani masala", "fr")).toBe("biryani masala");
    await flush();
    expect(ingredientName("biryani masala", "fr")).toBe("masala biryani");
    expect(onFailed).toHaveBeenCalledWith("remove", expect.any(Error));
  });

  it("is quiet for a save that a newer one replaced", async () => {
    const api = fakeApi();
    const onFailed = vi.fn();
    const saver = createNameSaver({ api, onFailed });
    const { ref } = saver.save(draft());
    await flush();
    api.failing = true;
    saver.save(draft({ frOne: "perdu" }), ref);
    api.failing = false;
    saver.save(draft({ frOne: "gagnant" }), ref);
    await flush();
    await flush();
    expect(onFailed).not.toHaveBeenCalled();
    expect(api.rows.get("s1").frOne).toBe("gagnant");
  });
});

describe("loading and logging out", () => {
  it("takes the server's list as it is, and gives each change its ref", () => {
    const saver = createNameSaver({ api: fakeApi() });
    saver.load([
      { id: "a1", replaces: null, hidden: false, enOne: "x", enOther: "=", frOne: "y", frOther: "=", gender: "m" },
      { id: "r1", replaces: "shallot", hidden: true, enOne: "", enOther: "", frOne: "", frOther: "", gender: "" },
    ]);
    expect(getIngredientOverrides().map((r) => r.ref)).toEqual(["added:a1", "built:shallot"]);
    expect(saver.get("built:shallot")).toMatchObject({ hidden: true });
    expect(ingredientName("shallots", "fr")).toBe("shallots");
  });

  it("goes back to the built-in names when it is cleared", () => {
    const saver = createNameSaver({ api: fakeApi() });
    saver.load([{ id: "a1", replaces: null, hidden: false, enOne: "biryani masala", enOther: "=", frOne: "masala biryani", frOther: "=", gender: "m" }]);
    expect(ingredientName("biryani masala", "fr")).toBe("masala biryani");
    saver.clear();
    expect(ingredientName("biryani masala", "fr")).toBe("biryani masala");
  });

  it("takes something that is not a list as nothing", () => {
    const saver = createNameSaver({ api: fakeApi() });
    saver.load(undefined);
    expect(getIngredientOverrides()).toEqual([]);
  });
});

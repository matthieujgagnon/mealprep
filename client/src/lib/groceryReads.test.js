import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api.js";

// A fetch we control: each call is written down and answers when told to.
function fakeFetch() {
  const calls = [];
  const fetchFn = vi.fn((url, options = {}) => {
    const call = { name: `${options.method || "GET"} ${url}`, answer: null };
    calls.push(call);
    return new Promise((resolve) => {
      call.answer = (data) => resolve({ ok: true, status: 200, json: async () => data });
    });
  });
  vi.stubGlobal("fetch", fetchFn);
  return calls;
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => vi.unstubAllGlobals());

describe("grocery reads and saves", () => {
  it("a read waits for a save already sent", async () => {
    const calls = fakeFetch();
    const save = api.addGroceryExtra({ name: "lemons" });
    const read = api.listGroceryExtras();
    await settle();
    expect(calls.map((c) => c.name)).toEqual(["POST /api/grocery-extra-items"]);
    calls[0].answer({ id: "1" });
    await save;
    await settle();
    expect(calls.map((c) => c.name)).toEqual(["POST /api/grocery-extra-items", "GET /api/grocery-extra-items"]);
    calls[1].answer([{ id: "1" }]);
    expect(await read).toEqual([{ id: "1" }]);
  });

  it("a read that was on its way when a save started is read again, and only the newer answer comes back", async () => {
    const calls = fakeFetch();
    const read = api.listGroceryExtras();
    await settle();
    const save = api.addGroceryExtra({ name: "lemons" });
    await settle();
    calls[0].answer([]); // the answer from before the save
    calls[1].answer({ id: "1" }); // the save lands
    await save;
    await settle();
    expect(calls.map((c) => c.name)).toEqual(["GET /api/grocery-extra-items", "POST /api/grocery-extra-items", "GET /api/grocery-extra-items"]);
    calls[2].answer([{ id: "1" }]);
    expect(await read).toEqual([{ id: "1" }]);
  });

  it("a read nothing overlapped is read once", async () => {
    const calls = fakeFetch();
    const read = api.listGroceryOverrides();
    await settle();
    calls[0].answer([]);
    expect(await read).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("a read is not held up by a save in another part of the app", async () => {
    const calls = fakeFetch();
    api.addGroceryExtra({ name: "lemons" });
    const read = api.listRecipes();
    await settle();
    expect(calls.map((c) => c.name)).toEqual(["POST /api/grocery-extra-items", "GET /api/recipes"]);
    calls[1].answer([]);
    expect(await read).toEqual([]);
    calls[0].answer({ id: "1" });
  });
});

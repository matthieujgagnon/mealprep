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

  it("a read of upcoming meals waits for a Planner save already sent", async () => {
    const calls = fakeFetch();
    const save = api.placeOnPlanner({ recipeId: "r1", weekStart: "2026-10-12", dayOfWeek: 2, mealType: "dinner" });
    const read = api.listPlannerUpcoming("2026-10-12");
    await settle();
    expect(calls.map((c) => c.name)).toEqual(["POST /api/planner"]);
    calls[0].answer({ id: "e1" });
    await save;
    await settle();
    expect(calls.map((c) => c.name)).toEqual(["POST /api/planner", "GET /api/planner/upcoming?from=2026-10-12"]);
    calls[1].answer([{ id: "e1" }]);
    expect(await read).toEqual([{ id: "e1" }]);
  });

  it("the grocery rows wait for a Planner save too, and the other Planner saves count the same", async () => {
    for (const send of [
      () => api.removeFromPlanner("e1"),
      () => api.updatePlannerEntry("e1", { dayOfWeek: 3 }),
      () => api.markSlotBlank("2026-10-12", 1, "lunch"),
      () => api.setPlannerEntryNote("e1", "out"),
      () => api.copyPlannerWeek("2026-10-05", "2026-10-12"),
    ]) {
      const calls = fakeFetch();
      const save = send();
      const read = api.listGroceryExtras();
      await settle();
      expect(calls).toHaveLength(1); // the read is held
      calls[0].answer({});
      await save;
      await settle();
      expect(calls).toHaveLength(2);
      calls[1].answer([]);
      await read;
      vi.unstubAllGlobals();
    }
  });

  it("a read of upcoming meals that was on its way when a Planner save started is read again", async () => {
    const calls = fakeFetch();
    const read = api.listPlannerUpcoming("2026-10-12");
    await settle();
    const save = api.placeOnPlanner({ recipeId: "r1", weekStart: "2026-10-12", dayOfWeek: 2, mealType: "dinner" });
    await settle();
    calls[0].answer([]); // the answer from before the meal was placed
    calls[1].answer({ id: "e1" });
    await save;
    await settle();
    expect(calls.map((c) => c.name)).toEqual([
      "GET /api/planner/upcoming?from=2026-10-12",
      "POST /api/planner",
      "GET /api/planner/upcoming?from=2026-10-12",
    ]);
    calls[2].answer([{ id: "e1" }]);
    expect(await read).toEqual([{ id: "e1" }]);
  });

  it("a recipe edit or delete is a save a read of upcoming meals waits for", async () => {
    for (const send of [() => api.updateRecipe("r1", { title: "Soup" }), () => api.deleteRecipe("r1")]) {
      const calls = fakeFetch();
      const save = send();
      const read = api.listPlannerUpcoming("2026-10-12");
      await settle();
      expect(calls).toHaveLength(1);
      calls[0].answer({});
      await save;
      await settle();
      expect(calls).toHaveLength(2);
      calls[1].answer([]);
      await read;
      vi.unstubAllGlobals();
    }
  });

  it("reading a recipe link does not hold the grocery list up", async () => {
    const calls = fakeFetch();
    api.scrapeRecipe("https://example.com/soup");
    const read = api.listGroceryExtras();
    await settle();
    expect(calls.map((c) => c.name)).toEqual(["POST /api/recipes/scrape", "GET /api/grocery-extra-items"]);
    calls[1].answer([]);
    expect(await read).toEqual([]);
    calls[0].answer({});
  });
});

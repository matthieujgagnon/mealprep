import { describe, expect, it } from "vitest";
import { GROCERY, LINKS, afterSaves, noteSave, readArea, saveArea, savesVersion } from "./pendingSaves.js";

// A save we can finish (or fail) when we choose.
function later() {
  let done;
  let fail;
  const promise = new Promise((resolve, reject) => {
    done = resolve;
    fail = reject;
  });
  return { promise, done, fail };
}

describe("pendingSaves", () => {
  it("a read waits until the save has ended", async () => {
    const save = later();
    noteSave("a", save.promise);
    let read = false;
    const waiting = afterSaves("a").then(() => {
      read = true;
    });
    await Promise.resolve();
    expect(read).toBe(false);
    save.done();
    await waiting;
    expect(read).toBe(true);
  });

  it("a save that fails still lets the read go, and the save itself still fails for its caller", async () => {
    const save = later();
    const seen = noteSave("b", save.promise);
    const waiting = afterSaves("b");
    save.fail(new Error("no"));
    await expect(seen).rejects.toThrow("no");
    await waiting;
  });

  it("waits for every save, including ones sent while waiting", async () => {
    const first = later();
    const second = later();
    noteSave("c", first.promise);
    let read = false;
    const waiting = afterSaves("c").then(() => {
      read = true;
    });
    noteSave("c", second.promise);
    first.done();
    await Promise.resolve();
    await Promise.resolve();
    expect(read).toBe(false);
    second.done();
    await waiting;
    expect(read).toBe(true);
  });

  it("areas do not wait for each other", async () => {
    noteSave("d", later().promise); // never ends
    await afterSaves("e");
  });

  it("the version moves when a save starts and when it ends", async () => {
    const before = savesVersion("f");
    const save = later();
    noteSave("f", save.promise);
    const started = savesVersion("f");
    expect(started).not.toBe(before);
    save.done();
    await afterSaves("f");
    expect(savesVersion("f")).not.toBe(started);
  });
});

describe("which requests the grocery list is made of", () => {
  it("a Planner save, a recipe edit and a recipe delete are saves the grocery list waits for", () => {
    expect(saveArea("/grocery-extra-items", "POST")).toBe(GROCERY);
    expect(saveArea("/planner", "POST")).toBe(GROCERY);
    expect(saveArea("/planner/abc", "PUT")).toBe(GROCERY);
    expect(saveArea("/planner/abc", "DELETE")).toBe(GROCERY);
    expect(saveArea("/planner/blank", "POST")).toBe(GROCERY);
    expect(saveArea("/planner/copy-week", "POST")).toBe(GROCERY);
    expect(saveArea("/planner/abc/note", "PUT")).toBe(GROCERY);
    expect(saveArea("/recipes/abc", "PUT")).toBe(GROCERY);
    expect(saveArea("/recipes/abc", "DELETE")).toBe(GROCERY);
  });

  it("anything else is not, including reading a recipe link, which saves nothing and can be slow", () => {
    expect(saveArea("/recipes/scrape", "POST")).toBeNull();
    expect(saveArea("/recipes/parse-ingredients", "POST")).toBeNull();
    expect(saveArea("/recipes/import", "POST")).toBeNull();
    expect(saveArea("/recipes", "POST")).toBeNull();
    expect(saveArea("/pantry-inventory", "POST")).toBeNull();
    expect(saveArea("/auth/me", "PATCH")).toBeNull();
  });

  it("the grocery data and the upcoming meals wait for those saves; the rest of the Planner and Recipes don't", () => {
    expect(readArea("/grocery-checked")).toBe(GROCERY);
    expect(readArea("/planner/upcoming?from=2026-10-12")).toBe(GROCERY);
    expect(readArea("/planner?week=2026-10-12")).toBeNull();
    expect(readArea("/planner/dates?from=a&to=b")).toBeNull();
    expect(readArea("/recipes")).toBeNull();
  });
});

describe("the taught names (I have it as…) are an area of their own", () => {
  it("their saves are in the links area, and only a read of them waits for those", () => {
    expect(saveArea("/inventory-links", "POST")).toBe(LINKS);
    expect(saveArea("/inventory-links/abc", "DELETE")).toBe(LINKS);
    expect(readArea("/inventory-links")).toBe(LINKS);
    expect(readArea("/grocery-checked")).toBe(GROCERY);
  });

  it("a teach does not hold the grocery list back, nor the grocery list a read of the links", async () => {
    noteSave(LINKS, later().promise); // never ends
    await afterSaves(GROCERY);
    noteSave(GROCERY, later().promise); // never ends
    expect(saveArea("/pantry-inventory", "POST")).toBeNull();
  });
});

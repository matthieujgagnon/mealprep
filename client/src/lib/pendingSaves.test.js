import { describe, expect, it } from "vitest";
import { afterSaves, noteSave, savesVersion } from "./pendingSaves.js";

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

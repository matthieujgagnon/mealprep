import { describe, expect, it } from "vitest";
import { saveInOrder } from "./saveInOrder.js";
import { afterSaves } from "./pendingSaves.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A pretend server: each save lands after its own delay, and the last one to
// land is what it keeps.
function server() {
  const kept = {};
  const order = [];
  return {
    kept,
    order,
    save: (key, value, ms) => async () => {
      await wait(ms);
      kept[key] = value;
      order.push(value);
    },
  };
}

describe("saveInOrder", () => {
  it("keeps the last tap even when the first save is the slowest", async () => {
    const db = server();
    const saves = saveInOrder();
    // Three quick taps: bought, queued, back to buy. The first save is slow.
    const results = [
      saves.run("lemons", db.save("lemons", "bought", 30)),
      saves.run("lemons", db.save("lemons", "queued", 5)),
      saves.run("lemons", db.save("lemons", "to buy", 1)),
    ];
    const answers = await Promise.all(results);
    expect(db.order).toEqual(["bought", "queued", "to buy"]);
    expect(db.kept.lemons).toBe("to buy");
    expect(answers.map((a) => a.latest)).toEqual([false, false, true]);
  });

  it("doesn't hold one item's saves behind another's", async () => {
    const db = server();
    const saves = saveInOrder();
    const slow = saves.run("milk", db.save("milk", "bought", 30));
    await saves.run("eggs", db.save("eggs", "bought", 1));
    expect(db.order).toEqual(["bought"]);
    expect(db.kept).toEqual({ eggs: "bought" });
    await slow;
  });

  it("carries on after a failed save, and says which tap was the newest", async () => {
    const db = server();
    const saves = saveInOrder();
    const failed = saves.run("lemons", async () => {
      await wait(5);
      throw new Error("offline");
    });
    const next = saves.run("lemons", db.save("lemons", "queued", 1));
    expect(await failed).toMatchObject({ ok: false, latest: false });
    expect(await next).toEqual({ ok: true, latest: true });
    expect(db.kept.lemons).toBe("queued");
  });

  it("makes a read wait for saves that haven't started yet", async () => {
    const db = server();
    const saves = saveInOrder({ area: "test-area" });
    saves.run("lemons", db.save("lemons", "bought", 20));
    saves.run("lemons", db.save("lemons", "queued", 5));
    await afterSaves("test-area");
    expect(db.kept.lemons).toBe("queued");
  });
});

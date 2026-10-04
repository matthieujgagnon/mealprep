import { describe, expect, it } from "vitest";
import { mergeRecent } from "./recentItems.js";

const item = (name, createdAt, extra = {}) => ({ name, createdAt, quantity: 1, unit: "each", location: "fridge", ...extra });
const log = (name, createdAt) => ({ name, createdAt });

describe("mergeRecent", () => {
  it("lists distinct names newest first, from items and from what was used up", () => {
    const out = mergeRecent(
      [item("Milk", "2026-10-01"), item("Eggs", "2026-10-03", { quantity: 12, unit: null })],
      [log("Butter", "2026-10-02"), log("milk", "2026-09-01")]
    );
    expect(out.map((r) => r.name)).toEqual(["Eggs", "Butter", "Milk"]);
  });

  it("gives an item's amount, unit and shelf, and only the name for a used-up one", () => {
    const out = mergeRecent([item("Eggs", "2026-10-03", { quantity: 12, unit: null, location: "pantry" })], [log("Butter", "2026-10-02")]);
    expect(out[0]).toEqual({ name: "Eggs", quantity: 12, unit: null, location: "pantry" });
    expect(out[1]).toEqual({ name: "Butter", quantity: null, unit: null, location: null });
  });

  it("keeps the newest of a repeated name, ignores blanks, and stops at the limit", () => {
    const many = Array.from({ length: 12 }, (_, i) => item(`Food ${i}`, `2026-10-${String(i + 1).padStart(2, "0")}`));
    expect(mergeRecent([...many, item("  ", "2026-10-20")], [])).toHaveLength(8);
    const out = mergeRecent([item("Milk", "2026-10-01", { quantity: 1 }), item("milk", "2026-10-05", { quantity: 4 })], []);
    expect(out).toEqual([{ name: "milk", quantity: 4, unit: "each", location: "fridge" }]);
  });
});

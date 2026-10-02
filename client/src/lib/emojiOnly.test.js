import { describe, expect, it } from "vitest";
import { isEmojiOnly } from "./plannerSlots.js";

describe("isEmojiOnly", () => {
  it("is true for one or more emoji", () => {
    for (const t of ["🥗", " 🍕🍺 ", "👨‍👩‍👧", "👍🏽", "❤️", "🇨🇦"]) expect(isEmojiOnly(t)).toBe(true);
  });
  it("is false with any letters, digits or nothing", () => {
    for (const t of ["", "  ", "Fries 🍟", "🍟 night", "2", "#", "Hockey pool"]) expect(isEmojiOnly(t)).toBe(false);
  });
});

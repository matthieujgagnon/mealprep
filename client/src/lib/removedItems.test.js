import { afterEach, describe, expect, it, vi } from "vitest";
import { setLang } from "../i18n/index.js";
import { onRemovedChanged, removedChanged, removedHowLabel, removedWhenLabel } from "./removedItems.js";

describe("Recently removed labels", () => {
  afterEach(() => setLang("en"));

  it("says when in Quebec days, not hours", () => {
    // Removed Oct 13 at 11 p.m. in Quebec (already Oct 14 in UTC).
    const at = "2026-10-14T03:00:00Z";
    expect(removedWhenLabel(at, new Date("2026-10-14T03:30:00Z"))).toBe("today");
    expect(removedWhenLabel(at, new Date("2026-10-14T15:00:00Z"))).toBe("yesterday");
    expect(removedWhenLabel(at, new Date("2026-10-16T15:00:00Z"))).toBe("3 days ago");
    setLang("fr");
    expect(removedWhenLabel(at, new Date("2026-10-14T03:30:00Z"))).toBe("aujourd'hui");
    expect(removedWhenLabel(at, new Date("2026-10-14T15:00:00Z"))).toBe("hier");
    expect(removedWhenLabel(at, new Date("2026-10-16T15:00:00Z"))).toBe("il y a 3 jours");
  });

  it("names how it left in both languages", () => {
    expect(["consumed", "wasted", "deleted", "cooked"].map(removedHowLabel)).toEqual(["Used up", "Tossed", "Deleted", "Cooked"]);
    setLang("fr");
    expect(["consumed", "wasted", "deleted", "cooked"].map(removedHowLabel)).toEqual(["Utilisé", "Jeté", "Supprimé", "Cuisiné"]);
  });

  it("tells listeners once a change has landed, and passes the answer through", () => {
    const seen = vi.fn();
    const off = onRemovedChanged(seen);
    expect(removedChanged({ ok: 1 })).toEqual({ ok: 1 });
    expect(seen).toHaveBeenCalledTimes(1);
    off();
    removedChanged();
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

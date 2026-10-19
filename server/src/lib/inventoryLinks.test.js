import { describe, expect, it } from "vitest";
import { cleanLinkInput, LINK_MAX, LINK_NAME_MAX, linkKey, linkLabel } from "./inventoryLinks.js";

describe("the names of a link", () => {
  // The same table is in the client's lib/inventoryLinks.test.js: both sides must
  // fold a name the same way, or a taught link never matches.
  it.each([
    ["Rice wine vinegar", "rice wine vinegar"],
    ["  Rice   wine\tvinegar ", "rice wine vinegar"],
    ["Vinaigre de RIZ", "vinaigre de riz"],
    ["Crème sure", "creme sure"],
    ["Œufs", "oeufs"],
    ["Poivrons rouges", "poivrons rouges"],
    ["Lait 2 %", "lait 2 %"],
  ])("%s is compared as %s", (name, key) => {
    expect(linkKey(name)).toBe(key);
  });

  it("keeps the name as it was seen, tidied", () => {
    expect(linkLabel("  Rice   wine\tvinegar ")).toBe("Rice wine vinegar");
    expect(linkLabel(null)).toBe("");
  });
});

describe("cleanLinkInput", () => {
  it("keeps both keys and both labels", () => {
    expect(cleanLinkInput({ recipeName: "Rice vinegar", itemName: "  Rice  Wine vinegar" })).toEqual({
      data: { recipeName: "rice vinegar", itemName: "rice wine vinegar", recipeLabel: "Rice vinegar", itemLabel: "Rice Wine vinegar" },
    });
  });

  it("refuses an empty name, a long name and two names that are the same", () => {
    expect(cleanLinkInput({ recipeName: "", itemName: "Rice" })).toEqual({ error: "linkNameEmpty" });
    expect(cleanLinkInput({ recipeName: "Rice", itemName: "   " })).toEqual({ error: "linkNameEmpty" });
    expect(cleanLinkInput({ recipeName: "Rice" })).toEqual({ error: "linkNameEmpty" });
    expect(cleanLinkInput(null)).toEqual({ error: "linkNameEmpty" });
    expect(cleanLinkInput({ recipeName: "a".repeat(LINK_NAME_MAX + 1), itemName: "Rice" })).toEqual({ error: "linkNameTooLong", vars: { max: LINK_NAME_MAX } });
    expect(cleanLinkInput({ recipeName: "a".repeat(LINK_NAME_MAX), itemName: "Rice" }).data).toBeTruthy();
    expect(cleanLinkInput({ recipeName: "Crème sure", itemName: "creme  SURE" })).toEqual({ error: "linkSame" });
  });

  it("has a cap on how many a person keeps", () => {
    expect(LINK_MAX).toBeGreaterThan(50);
  });
});

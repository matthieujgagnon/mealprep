import { afterEach, describe, expect, it } from "vitest";
import { setLang, t } from "../i18n/index.js";
import { pillClass, salePercentText, salePillText } from "./pills.js";

afterEach(() => setLang("en"));

describe("pillClass", () => {
  it("is a tag with no tone by default", () => {
    expect(pillClass()).toBe("riso-pill size-tag");
  });

  it("adds the size, tone and flags", () => {
    expect(pillClass({ size: "chip", tone: "yellow", selected: true, className: "mine" })).toBe(
      "riso-pill size-chip tone-yellow is-selected mine"
    );
    expect(pillClass({ size: "badge", outlineBlue: true })).toBe("riso-pill size-badge outline-blue");
    expect(pillClass({ tone: "pink", sticker: true })).toBe("riso-pill size-tag tone-pink sticker");
  });

  it("refuses a size or tone the Pill Study doesn't have", () => {
    expect(() => pillClass({ size: "huge" })).toThrow();
    expect(() => pillClass({ tone: "purple" })).toThrow();
  });
});

describe("sale tag text", () => {
  it("reads -40% in English and -40 % (non-breaking space) in French", () => {
    expect(salePercentText(40)).toBe("-40%");
    setLang("fr");
    expect(salePercentText(40)).toBe("-40 %");
  });

  it("leaves out the percentage when there is none", () => {
    expect(salePercentText(0)).toBe("");
    expect(salePercentText(null)).toBe("");
    expect(salePillText({ store: "Metro", price: "$5.99" })).toBe("Metro $5.99");
    expect(salePillText({})).toBe("");
  });

  it("puts the percentage, store and price together, the price written for the language", () => {
    expect(salePillText({ percent: 40, store: "Metro", price: "$5.99" })).toBe("-40% Metro $5.99");
    setLang("fr");
    expect(salePillText({ percent: 40, store: "Metro", price: "$5.99" })).toBe("-40 % Metro 5,99 $");
  });
});

describe("pill strings", () => {
  it("serves reads Serves 4 / 4 portions, and 1 portion", () => {
    expect(t("pills.serves", { count: 4 })).toBe("Serves 4");
    setLang("fr");
    expect(t("pills.serves", { count: 4 })).toBe("4 portions");
    expect(t("pills.serves", { count: 1 })).toBe("1 portion");
  });

  it("planned names the day, to buy counts", () => {
    expect(t("pills.planned", { day: "Wednesday" })).toBe("Planned Wednesday");
    expect(t("pills.toBuy", { count: 3 })).toBe("3 to buy");
    setLang("fr");
    expect(t("pills.planned", { day: "mercredi" })).toBe("Prévu mercredi");
    expect(t("pills.toBuy", { count: 3 })).toBe("3 à acheter");
  });
});

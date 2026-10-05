// The way each language writes money, numbers, dates and lists.
import { afterEach, describe, expect, it } from "vitest";
import { setLang, t, tx } from "./index.js";
import {
  formatDate,
  formatDayRange,
  formatList,
  formatMoney,
  formatMonthDay,
  formatNumber,
  formatShortDay,
  formatUnitPrice,
  localizePrice,
  perUnit,
} from "./format.js";
import { formatWeekRangeLabel, formatWeekdayMonthDay } from "../lib/dates.js";
import { formatQuantity, unitLabel } from "../lib/units.js";

// Intl puts a no-break space between "4,99" and "$"; compare as plain spaces.
const plain = (s) => String(s).replace(/\s/g, " ");

afterEach(() => setLang("en"));

describe("money and numbers", () => {
  it("writes dollars the English and the Quebec way", () => {
    expect(formatMoney(4.99, "en")).toBe("$4.99");
    expect(plain(formatMoney(4.99, "fr"))).toBe("4,99 $");
    expect(plain(formatMoney(1234.5, "fr"))).toBe("1 234,50 $");
    expect(formatMoney(null)).toBe("");
    expect(plain(formatNumber(1234.5, undefined, "fr"))).toBe("1 234,5");
  });

  it("says per lb the same way in both languages, and each as ea / ch.", () => {
    expect(formatUnitPrice(3.99, "lb", "en")).toBe("$3.99/lb");
    expect(plain(formatUnitPrice(3.99, "lb", "fr"))).toBe("3,99 $/lb");
    expect(perUnit("each", "en")).toBe(" ea");
    expect(perUnit("each", "fr")).toBe(" ch.");
  });

  it("leaves a flyer's own price as printed in English and rewrites it in French", () => {
    expect(localizePrice("2/$5", "en")).toBe("2/$5");
    expect(plain(localizePrice("$4.99", "fr"))).toBe("4,99 $");
    expect(plain(localizePrice("2 for $5.00", "fr"))).toBe("2 pour 5,00 $");
    expect(plain(localizePrice("$3.99/lb", "fr"))).toBe("3,99 $/lb");
    expect(plain(localizePrice("Save $2", "fr"))).toBe("Économisez 2,00 $");
    expect(plain(localizePrice("$2.00 off", "fr"))).toBe("2,00 $ de rabais");
    expect(localizePrice("Points offer", "fr")).toBe("Offre de points");
    expect(localizePrice("", "fr")).toBe("");
  });

  it("writes recipe amounts with a decimal comma in French", () => {
    setLang("fr");
    expect(formatQuantity(1.5)).toBe("1 1/2");
    expect(formatQuantity(1.2)).toBe("1,2");
    expect(unitLabel("cup", 2)).toBe("tasses");
    expect(unitLabel("tbsp", 1)).toBe("c. à soupe");
    expect(unitLabel("g", 500)).toBe("g");
  });
});

describe("dates", () => {
  const monday = new Date(2026, 8, 28);

  it("writes days and months in each language", () => {
    expect(formatShortDay(monday, "en")).toBe("Mon, Sep 28");
    expect(formatShortDay(monday, "fr")).toBe("lun. 28 sept.");
    expect(formatMonthDay(monday, "en")).toBe("Sep 28");
    expect(formatMonthDay(monday, "fr")).toBe("28 sept.");
    expect(formatDate("2026-10-07", { weekday: "long" }, "fr")).toBe("mercredi");
  });

  it("labels a week, with or without its year", () => {
    expect(formatWeekRangeLabel("2026-09-28")).toBe("Sep 28 – Oct 4, 2026");
    expect(formatWeekRangeLabel("2026-09-28", { year: false })).toBe("Sep 28 – Oct 4");
    setLang("fr");
    expect(formatWeekRangeLabel("2026-09-28")).toBe("28 sept. – 4 oct. 2026");
    expect(formatWeekRangeLabel("2026-10-05", { year: false })).toBe("5 – 11 oct.");
    expect(formatWeekdayMonthDay(monday)).toBe("Lundi 28 sept.");
  });

  it("says how long food keeps", () => {
    expect(formatDayRange(5, 7, "en")).toBe("5–7 days");
    expect(formatDayRange(1, 1, "en")).toBe("1 day");
    expect(formatDayRange(90, 180, "en")).toBe("3–6 months");
    expect(formatDayRange(5, 7, "fr")).toBe("5 à 7 jours");
    expect(formatDayRange(90, 180, "fr")).toBe("3 à 6 mois");
    expect(formatDayRange(365, 365, "fr")).toBe("1 an");
  });
});

describe("text", () => {
  it("joins a list the way each language reads it", () => {
    expect(formatList(["spinach", "feta", "eggs"], "en")).toBe("spinach, feta and eggs");
    expect(formatList(["épinards", "feta", "œufs"], "fr")).toBe("épinards, feta et œufs");
    expect(formatList([], "fr")).toBe("");
  });

  it("picks the plural French uses (0 and 1 are singular)", () => {
    expect(t("finder.chosen", { count: 2 }, "fr")).toBe("2 choisis");
    expect(t("finder.chosen", { count: 1 }, "fr")).toBe("1 choisi");
    expect(t("inventory.itemCount", { count: 0 }, "fr")).toBe("0 article");
    expect(t("inventory.itemCount", { count: 1 }, "fr")).toBe("1 article");
    expect(t("inventory.itemCount", { count: 2 }, "fr")).toBe("2 articles");
    expect(t("inventory.itemCount", { count: 0 }, "en")).toBe("0 items");
  });

  it("falls back to English, then to the key, for a missing text", () => {
    expect(t("no.such.key", null, "fr")).toBe("no.such.key");
  });

  it("drops React elements into a sentence", () => {
    const parts = tx("makeable.youNeed", { count: { $$typeof: Symbol.for("react.element"), type: "b", props: {}, key: null } }, "fr");
    expect(parts[0]).toBe("Il vous faut ");
  });
});

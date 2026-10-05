import { describe, expect, it } from "vitest";
import { DEFAULT_WEEKEND, WEEKEND_PRESETS, presetIsOn, sameWeekend, weekendFrom, weekendLayout, weekendSummary } from "./weekend.js";
import { setLang } from "../i18n/index.js";

const w = (days, eve = true, on = true) => ({ on, days, eve });

describe("weekendFrom", () => {
  it("reads the account's weekend, or the default", () => {
    expect(weekendFrom({ weekendDays: [6, 4], weekendOn: false, weekendEve: false })).toEqual({ on: false, days: [4, 6], eve: false });
    expect(weekendFrom({})).toEqual(DEFAULT_WEEKEND);
    expect(weekendFrom(undefined)).toEqual(DEFAULT_WEEKEND);
  });
});

describe("presets", () => {
  it("knows which preset is on", () => {
    expect(presetIsOn(WEEKEND_PRESETS[0], w([5, 6], true))).toBe(true);
    expect(presetIsOn(WEEKEND_PRESETS[0], w([5, 6], false))).toBe(false);
    expect(presetIsOn(WEEKEND_PRESETS[1], w([5, 6], false))).toBe(true);
    expect(presetIsOn(WEEKEND_PRESETS[2], w([0, 6], false))).toBe(true);
    expect(presetIsOn(WEEKEND_PRESETS[1], w([5, 6], false, false))).toBe(false);
  });
  it("compares weekends", () => {
    expect(sameWeekend(w([5, 6]), w([5, 6]))).toBe(true);
    expect(sameWeekend(w([5, 6]), w([5, 6], false))).toBe(false);
  });
});

describe("weekendLayout", () => {
  it("draws one plate for Saturday and Sunday, with the Friday supper as its evening before", () => {
    const layout = weekendLayout(w([5, 6]));
    expect(layout.plates).toHaveLength(1);
    expect(layout.plates[0]).toMatchObject({ start: 5, end: 6, eve: true });
    expect(layout.isWeekendSlot(5, 0)).toBe(true);
    expect(layout.isWeekendSlot(4, 2)).toBe(true); // Friday supper
    expect(layout.isWeekendSlot(4, 1)).toBe(false); // Friday lunch
  });

  it("nudges the columns: 4px at the start of the block, 4px for each extra day", () => {
    const { shiftX } = weekendLayout(w([5, 6], false));
    expect(shiftX).toEqual([0, 0, 0, 0, 0, 4, 8]);
  });

  it("nudges the evening before's column too, and each row down a little more", () => {
    const layout = weekendLayout(w([5, 6], true));
    expect(layout.shiftX).toEqual([0, 0, 0, 0, 4, 8, 12]);
    expect(layout.shiftY(5, 0)).toBe(0);
    expect(layout.shiftY(5, 2)).toBe(8);
    expect(layout.shiftY(4, 1)).toBe(4);
    expect(layout.shiftY(2, 2)).toBe(0);
  });

  it("has no evening before when the block starts on Monday, or is switched off", () => {
    expect(weekendLayout(w([0, 1])).plates[0].eve).toBe(false);
    expect(weekendLayout(w([5, 6], false)).plates[0].eve).toBe(false);
    expect(weekendLayout(w([5, 6], true, false)).plates).toEqual([]);
    expect(weekendLayout(w([], true)).on).toBe(false);
  });

  it("makes a plate for each separate run, and no evening where the day before is a weekend day", () => {
    const layout = weekendLayout(w([0, 2, 3], true));
    expect(layout.plates.map((p) => [p.start, p.end, p.eve])).toEqual([[0, 0, false], [2, 3, true]]);
    expect(layout.isWeekendSlot(1, 2)).toBe(true); // Tuesday supper is the evening before Wednesday
  });

  it("makes room on the right and at the bottom for the nudges", () => {
    const layout = weekendLayout(w([5, 6], true));
    expect(layout.padRight).toBe(12 + 8 + 10);
    expect(layout.padBottom).toBe(8 + 8 + 6);
  });
});

describe("weekendSummary", () => {
  it("says the weekend in words, in the app's language", () => {
    setLang("en");
    expect(weekendSummary(w([5, 6], true))).toBe("Fri eve + Sat–Sun");
    expect(weekendSummary(w([5, 6], false))).toBe("Sat–Sun");
    expect(weekendSummary(w([2, 5, 6], false))).toBe("Wed, Sat–Sun");
    expect(weekendSummary(w([5, 6], true, false))).toBe("");
    setLang("fr");
    expect(weekendSummary(w([5, 6], true))).toBe("ven. soir + sam.–dim.");
    setLang("en");
  });
});

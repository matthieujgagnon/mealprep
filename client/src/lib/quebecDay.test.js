import { describe, expect, it } from "vitest";
import { addDays, daysBetween, daysFromToday, quebecDay, expiryDay } from "./quebecDay.js";

// 9 a.m., 3 p.m. and 11 p.m. in Quebec on Oct 12, 2026 (daylight time, UTC-4). At 11 p.m.
// it is already Oct 13 in UTC, which is where a day goes wrong.
const NINE_AM = new Date("2026-10-12T13:00:00Z");
const THREE_PM = new Date("2026-10-12T19:00:00Z");
const ELEVEN_PM = new Date("2026-10-13T03:00:00Z");

describe("quebecDay", () => {
  it("is the Quebec calendar day at any hour", () => {
    expect(quebecDay(NINE_AM)).toBe("2026-10-12");
    expect(quebecDay(THREE_PM)).toBe("2026-10-12");
    expect(quebecDay(ELEVEN_PM)).toBe("2026-10-12");
  });

  it("changes at Quebec midnight, in summer and in winter", () => {
    expect(quebecDay(new Date("2026-10-13T03:59:59Z"))).toBe("2026-10-12");
    expect(quebecDay(new Date("2026-10-13T04:00:00Z"))).toBe("2026-10-13");
    expect(quebecDay(new Date("2027-01-13T04:59:59Z"))).toBe("2027-01-12");
    expect(quebecDay(new Date("2027-01-13T05:00:00Z"))).toBe("2027-01-13");
  });
});

describe("addDays and daysBetween", () => {
  it("move along the calendar across months, years and the leap day", () => {
    expect(addDays("2026-10-12", 4)).toBe("2026-10-16");
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2028-02-28", 2)).toBe("2028-03-01");
    expect(addDays("2026-10-12", -12)).toBe("2026-09-30");
    expect(daysBetween("2026-10-12", "2026-10-16")).toBe(4);
    expect(daysBetween("2026-10-16", "2026-10-12")).toBe(-4);
    expect(daysBetween("2026-10-12", "2026-10-12")).toBe(0);
  });

  it("count whole days over a clock change", () => {
    expect(daysBetween("2026-11-01", "2026-11-02")).toBe(1);
    expect(daysBetween("2026-03-08", "2026-03-09")).toBe(1);
  });
});

describe("expiryDay", () => {
  it("reads a typed or picked day (saved as midnight UTC) as the day it says", () => {
    expect(expiryDay("2026-10-16")).toBe("2026-10-16");
    expect(expiryDay("2026-10-16T00:00:00.000Z")).toBe("2026-10-16");
    expect(expiryDay(new Date("2026-10-16T00:00:00Z"))).toBe("2026-10-16");
  });

  it("reads any other moment as the Quebec day it falls on", () => {
    expect(expiryDay("2026-10-17T03:00:00.000Z")).toBe("2026-10-16"); // 11 p.m. on the 16th in Quebec
    expect(expiryDay("2026-10-16T13:00:00.000Z")).toBe("2026-10-16");
    expect(expiryDay("2026-10-16T04:00:00.000Z")).toBe("2026-10-16"); // Quebec midnight
    expect(expiryDay("2026-10-16T03:59:59.000Z")).toBe("2026-10-15");
  });

  it("is null for no date or a bad one", () => {
    expect(expiryDay(null)).toBeNull();
    expect(expiryDay(undefined)).toBeNull();
    expect(expiryDay("")).toBeNull();
    expect(expiryDay("not a date")).toBeNull();
  });
});

describe("daysFromToday", () => {
  it("counts Quebec calendar days, the same at 9 a.m., 3 p.m. and 11 p.m.", () => {
    for (const now of [NINE_AM, THREE_PM, ELEVEN_PM]) {
      expect(daysFromToday("2026-10-16", now)).toBe(4);
      expect(daysFromToday("2026-10-12", now)).toBe(0);
      expect(daysFromToday("2026-10-11", now)).toBe(-1);
    }
  });

  it("counts a moment by its Quebec day, not by the hours until it", () => {
    // 5 p.m. today in Quebec, seen at 9 a.m.: today, not "tomorrow".
    expect(daysFromToday("2026-10-12T21:00:00Z", NINE_AM)).toBe(0);
    // 9 a.m. on the 16th, seen at 11 p.m. on the 12th: still four days.
    expect(daysFromToday("2026-10-16T13:00:00Z", ELEVEN_PM)).toBe(4);
  });

  it("is NaN for a bad date", () => {
    expect(daysFromToday("nope", NINE_AM)).toBeNaN();
  });
});

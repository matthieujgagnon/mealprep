import { describe, expect, it } from "vitest";
import { canSwitch, dayKind, INVITE_DAYS, INVITE_TONES, INVITE_USES, isAdminPath, limitReached, parseAiLimit, usableCount } from "./admin.js";

describe("isAdminPath", () => {
  it("is /admin, with or without a trailing slash", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/")).toBe(true);
    expect(isAdminPath("/")).toBe(false);
    expect(isAdminPath("/administrator")).toBe(false);
    expect(isAdminPath("/reset-password")).toBe(false);
    expect(isAdminPath("")).toBe(false);
  });
});

describe("dayKind", () => {
  const now = new Date(2026, 9, 11, 9, 30);

  it("says today and yesterday by calendar day, not by 24 hours", () => {
    expect(dayKind(new Date(2026, 9, 11, 0, 5), now)).toBe("today");
    expect(dayKind(new Date(2026, 9, 10, 23, 55), now)).toBe("yesterday");
    expect(dayKind(new Date(2026, 9, 10, 0, 1), now)).toBe("yesterday");
    expect(dayKind(new Date(2026, 9, 9, 23, 59), now)).toBe("date");
  });

  it("reads dates sent as text, and is never without one", () => {
    expect(dayKind(new Date(2026, 9, 11, 8).toISOString(), now)).toBe("today");
    expect(dayKind("2026-09-22T12:00:00.000Z", now)).toBe("date");
    expect(dayKind(null, now)).toBe("never");
    expect(dayKind("not a date", now)).toBe("never");
  });
});

describe("parseAiLimit", () => {
  it("reads a whole number from 0 to the most allowed", () => {
    expect(parseAiLimit("0")).toBe(0);
    expect(parseAiLimit("10")).toBe(10);
    expect(parseAiLimit(" 25 ")).toBe(25);
    expect(parseAiLimit("1000")).toBe(1000);
  });

  it("refuses anything else", () => {
    for (const bad of ["", "  ", "-1", "2.5", "1e3", "ten", "1001", "10 readings", null, undefined]) expect(parseAiLimit(bad)).toBeNull();
    expect(parseAiLimit("51", 50)).toBeNull();
  });
});

describe("limitReached", () => {
  it("is reached at the limit and over it", () => {
    expect(limitReached(9, 10)).toBe(false);
    expect(limitReached(10, 10)).toBe(true);
    expect(limitReached(12, 10)).toBe(true);
  });

  it("is never marked when the limit is 0: reading is paused for everyone", () => {
    expect(limitReached(0, 0)).toBe(false);
    expect(limitReached(3, 0)).toBe(false);
  });
});

describe("invite codes in the list", () => {
  it("offers single-use and limited-use codes, and a code that never expires", () => {
    expect(INVITE_USES[0]).toBe(1);
    expect(INVITE_USES.every((n) => Number.isInteger(n) && n >= 1 && n <= 100)).toBe(true);
    expect(INVITE_DAYS).toContain(null);
    expect(INVITE_DAYS.filter((d) => d !== null).every((d) => Number.isInteger(d) && d >= 1 && d <= 365)).toBe(true);
  });

  it("gives every state a pill tone", () => {
    expect(Object.keys(INVITE_TONES).sort()).toEqual(["active", "expired", "off", "used"]);
  });

  it("counts the codes that can still be used, and switches only those that are on or off", () => {
    const invites = [{ state: "active" }, { state: "used" }, { state: "off" }, { state: "active" }, { state: "expired" }];
    expect(usableCount(invites)).toBe(2);
    expect(invites.map(canSwitch)).toEqual([true, false, true, true, false]);
  });
});

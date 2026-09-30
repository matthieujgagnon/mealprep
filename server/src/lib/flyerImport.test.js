import { describe, expect, it } from "vitest";
import { isImportDue, latestFlyerStart } from "./flyerImport.js";

describe("latestFlyerStart", () => {
  it("is this Thursday at noon UTC once it has passed", () => {
    // Wednesday 2026-09-30 -> the Thursday before (Sep 24).
    expect(latestFlyerStart(new Date("2026-09-30T18:00:00Z")).toISOString()).toBe("2026-09-24T12:00:00.000Z");
    // Thursday Oct 1, before and after noon.
    expect(latestFlyerStart(new Date("2026-10-01T11:59:00Z")).toISOString()).toBe("2026-09-24T12:00:00.000Z");
    expect(latestFlyerStart(new Date("2026-10-01T12:30:00Z")).toISOString()).toBe("2026-10-01T12:00:00.000Z");
    // Sunday.
    expect(latestFlyerStart(new Date("2026-10-04T09:00:00Z")).toISOString()).toBe("2026-10-01T12:00:00.000Z");
  });
});

describe("isImportDue", () => {
  const now = new Date("2026-10-01T13:00:00Z"); // Thursday, just after new flyers

  it("is due when nothing succeeded since this week's flyers", () => {
    expect(isImportDue({ autoImport: true }, now)).toBe(true);
    expect(isImportDue({ autoImport: true, lastSuccessAt: "2026-09-24T13:00:00Z", lastImportAt: "2026-09-24T13:00:00Z" }, now)).toBe(true);
  });

  it("is not due after this week's import, or when auto-import is off", () => {
    expect(isImportDue({ autoImport: true, lastSuccessAt: "2026-10-01T12:05:00Z" }, now)).toBe(false);
    expect(isImportDue({ autoImport: false }, now)).toBe(false);
  });

  it("waits 3 hours after a failed attempt before trying again", () => {
    const failed = { autoImport: true, lastSuccessAt: "2026-09-24T13:00:00Z", lastImportAt: "2026-10-01T12:10:00Z" };
    expect(isImportDue(failed, now)).toBe(false);
    expect(isImportDue(failed, new Date("2026-10-01T15:20:00Z"))).toBe(true);
  });
});

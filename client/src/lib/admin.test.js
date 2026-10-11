import { describe, expect, it } from "vitest";
import { dayKind, isAdminPath } from "./admin.js";

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

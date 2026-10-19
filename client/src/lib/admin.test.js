import { describe, expect, it } from "vitest";
import { t } from "../i18n/index.js";
import {
  KIND_TONES,
  adminTabFor,
  canSwitch,
  dayKind,
  INVITE_DAYS,
  INVITE_TONES,
  INVITE_USES,
  isAdminPath,
  isFeedbackAdminPath,
  limitReached,
  pageKey,
  pathForTab,
  parseAiLimit,
  usableCount,
} from "./admin.js";

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

describe("the Feedback inbox's address", () => {
  it("is /admin/feedback, with or without a trailing slash, and not the Admin page", () => {
    expect(isFeedbackAdminPath("/admin/feedback")).toBe(true);
    expect(isFeedbackAdminPath("/admin/feedback/")).toBe(true);
    expect(isFeedbackAdminPath("/admin")).toBe(false);
    expect(isFeedbackAdminPath("/admin/feedback/x")).toBe(false);
    expect(isAdminPath("/admin/feedback")).toBe(false);
  });

  it("opens the page its address belongs to, and none for any other address", () => {
    expect(adminTabFor("/admin")).toBe("admin");
    expect(adminTabFor("/admin/")).toBe("admin");
    expect(adminTabFor("/admin/feedback")).toBe("feedbackInbox");
    expect(adminTabFor("/")).toBeNull();
    expect(adminTabFor("/reset-password")).toBeNull();
  });

  it("gives each page its address, and / to the rest", () => {
    expect(pathForTab("admin")).toBe("/admin");
    expect(pathForTab("feedbackInbox")).toBe("/admin/feedback");
    expect(pathForTab("home")).toBe("/");
    expect(pathForTab("help")).toBe("/");
    expect(adminTabFor(pathForTab("feedbackInbox"))).toBe("feedbackInbox");
  });
});

describe("how the inbox reads a stored page and kind", () => {
  it("has a title for each page the app can send, and none for one it doesn't know", () => {
    for (const page of ["home", "collection", "planner", "makeable", "grocery", "flyers", "inventory", "help", "admin", "feedbackInbox"]) {
      expect(t(pageKey(page))).not.toBe(pageKey(page));
    }
    expect(pageKey("somewhere")).toBeNull();
    expect(pageKey("unknown")).toBeNull();
  });

  it("has a pill tone for each kind", () => {
    expect(Object.keys(KIND_TONES).sort()).toEqual(["idea", "other", "wrong"]);
  });
});

describe("the Feedback inbox's Archive words", () => {
  it("says how many 'Archive all done' moved, with French counting 0 and 1 as one", () => {
    expect(t("admin.feedback.archivedMany", { count: 1 }, "en")).toBe("1 archived.");
    expect(t("admin.feedback.archivedMany", { count: 3 }, "en")).toBe("3 archived.");
    expect(t("admin.feedback.archivedMany", { count: 1 }, "fr")).toBe("1 archivé.");
    expect(t("admin.feedback.archivedMany", { count: 3 }, "fr")).toBe("3 archivés.");
  });

  it("puts the count on the 'Archive all done' button and the Quebec French names on the tabs and buttons", () => {
    expect(t("admin.feedback.archiveAll", { count: 7 }, "en")).toBe("Archive all done (7)");
    expect(t("admin.feedback.archiveAll", { count: 7 }, "fr")).toBe("Archiver tous les traités (7)");
    expect(t("admin.feedback.tabInbox", undefined, "fr")).toBe("Boîte de réception");
    expect(t("admin.feedback.tabArchive", undefined, "fr")).toBe("Archives");
    expect(t("admin.feedback.back", undefined, "en")).toBe("Back to inbox");
  });
});

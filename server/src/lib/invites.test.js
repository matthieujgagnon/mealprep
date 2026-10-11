import { describe, expect, it } from "vitest";
import { cleanInviteInput, expiryDate, generateCode, inviteRow, inviteState, normalizeCode } from "./invites.js";

describe("generateCode", () => {
  it("is 8 letters and digits written XXXX-XXXX, without look-alikes (0 O 1 I L)", () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
  });

  it("picks each character with the random source it is given", () => {
    expect(generateCode(() => 0)).toBe("2222-2222");
    expect(generateCode(() => 30)).toBe("ZZZZ-ZZZZ");
  });

  it("makes different codes", () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateCode()));
    expect(codes.size).toBe(100);
  });
});

describe("normalizeCode", () => {
  it("reads a code however it was typed: capitals, spaces, the dash or none", () => {
    expect(normalizeCode("K7M2-QX9P")).toBe("K7M2-QX9P");
    expect(normalizeCode("k7m2qx9p")).toBe("K7M2-QX9P");
    expect(normalizeCode("  k7m2 qx9p ")).toBe("K7M2-QX9P");
    expect(normalizeCode("K7M2–QX9P")).toBe("K7M2-QX9P"); // a long dash from a phone keyboard
  });

  it("leaves anything that isn't 8 letters/digits as bare letters and digits, which no code matches", () => {
    expect(normalizeCode("K7M2-QX9")).toBe("K7M2QX9");
    expect(normalizeCode("K7M2-QX9P-1")).toBe("K7M2QX9P1");
    expect(normalizeCode("")).toBe("");
    expect(normalizeCode(null)).toBe("");
    expect(normalizeCode(undefined)).toBe("");
  });
});

describe("inviteState", () => {
  const now = new Date("2026-10-11T12:00:00Z");
  const invite = (extra = {}) => ({ active: true, maxUses: 1, usedCount: 0, expiresAt: null, ...extra });

  it("is active while the code is on, has uses left and hasn't expired", () => {
    expect(inviteState(invite(), now)).toBe("active");
    expect(inviteState(invite({ maxUses: 5, usedCount: 4 }), now)).toBe("active");
    expect(inviteState(invite({ expiresAt: new Date("2026-10-11T12:00:01Z") }), now)).toBe("active");
  });

  it("is used once every use is spent", () => {
    expect(inviteState(invite({ usedCount: 1 }), now)).toBe("used");
    expect(inviteState(invite({ maxUses: 5, usedCount: 5 }), now)).toBe("used");
  });

  it("is expired from the moment it expires", () => {
    expect(inviteState(invite({ expiresAt: new Date("2026-10-11T12:00:00Z") }), now)).toBe("expired");
    expect(inviteState(invite({ expiresAt: "2026-10-01T00:00:00.000Z" }), now)).toBe("expired");
  });

  it("is off when switched off, whatever else is true of it", () => {
    expect(inviteState(invite({ active: false }), now)).toBe("off");
    expect(inviteState(invite({ active: false, usedCount: 1, expiresAt: new Date("2026-01-01") }), now)).toBe("off");
  });

  it("says expired before used, and unknown for no code at all", () => {
    expect(inviteState(invite({ usedCount: 1, expiresAt: new Date("2026-01-01") }), now)).toBe("expired");
    expect(inviteState(null, now)).toBe("unknown");
    expect(inviteState(undefined, now)).toBe("unknown");
  });
});

describe("cleanInviteInput", () => {
  it("defaults to a single-use code that never expires, with no note", () => {
    expect(cleanInviteInput({})).toEqual({ note: null, maxUses: 1, expiresInDays: null });
    expect(cleanInviteInput(undefined)).toEqual({ note: null, maxUses: 1, expiresInDays: null });
    expect(cleanInviteInput({ maxUses: null }).maxUses).toBe(1); // not given
  });

  it("keeps a trimmed note, the number of uses and the days", () => {
    expect(cleanInviteInput({ note: "  for Emilie ", maxUses: 3, expiresInDays: 14 })).toEqual({
      note: "for Emilie",
      maxUses: 3,
      expiresInDays: 14,
    });
    expect(cleanInviteInput({ note: "   " }).note).toBeNull();
    expect(cleanInviteInput({ note: "x".repeat(80) }).note).toHaveLength(80);
  });

  it("refuses a note that is too long, bad uses and bad days, with the message to show", () => {
    expect(cleanInviteInput({ note: "x".repeat(81) })).toEqual({ error: "inviteNoteTooLong" });
    for (const maxUses of [0, -1, 101, 1.5, "3", NaN]) {
      expect(cleanInviteInput({ maxUses })).toEqual({ error: "inviteBadUses" });
    }
    expect(cleanInviteInput({ maxUses: 100 }).maxUses).toBe(100);
    for (const expiresInDays of [0, -3, 366, 2.5, "7"]) {
      expect(cleanInviteInput({ expiresInDays })).toEqual({ error: "inviteBadExpiry" });
    }
    expect(cleanInviteInput({ expiresInDays: 365 }).expiresInDays).toBe(365);
    expect(cleanInviteInput({ expiresInDays: null }).expiresInDays).toBeNull();
  });
});

describe("expiryDate", () => {
  it("is that many days from now, or never", () => {
    const now = new Date("2026-10-11T12:00:00Z");
    expect(expiryDate(7, now)).toEqual(new Date("2026-10-18T12:00:00Z"));
    expect(expiryDate(null, now)).toBeNull();
    expect(expiryDate(undefined, now)).toBeNull();
  });
});

describe("inviteRow", () => {
  it("gives what the Admin list shows, and where the code stands", () => {
    const now = new Date("2026-10-11T12:00:00Z");
    const row = inviteRow(
      {
        id: "i1",
        code: "K7M2-QX9P",
        note: "for Emilie",
        maxUses: 2,
        usedCount: 2,
        expiresAt: null,
        active: true,
        createdAt: new Date("2026-10-01"),
        users: [{ email: "a@example.com" }, { email: "b@example.com" }],
        somethingElse: "left out",
      },
      now
    );
    expect(row).toEqual({
      id: "i1",
      code: "K7M2-QX9P",
      note: "for Emilie",
      maxUses: 2,
      usedCount: 2,
      expiresAt: null,
      active: true,
      state: "used",
      createdAt: new Date("2026-10-01"),
      usedBy: ["a@example.com", "b@example.com"],
    });
  });
});

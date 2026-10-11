import { describe, expect, it } from "vitest";
import { aiDay, aiLimitFailure, aiUsageRows, cleanAiLimit, DEFAULT_AI_DAILY_LIMIT, shouldGiveBack } from "./aiLimit.js";

describe("aiDay", () => {
  it("is the Quebec calendar day, so the count starts again at local midnight, not UTC midnight", () => {
    // October: Quebec is on summer time (UTC-4), midnight there is 04:00 UTC.
    expect(aiDay(new Date("2026-10-12T03:59:00Z"))).toBe("2026-10-11");
    expect(aiDay(new Date("2026-10-12T04:00:00Z"))).toBe("2026-10-12");
    // December: winter time (UTC-5), midnight there is 05:00 UTC.
    expect(aiDay(new Date("2026-12-01T04:59:00Z"))).toBe("2026-11-30");
    expect(aiDay(new Date("2026-12-01T05:00:00Z"))).toBe("2026-12-01");
  });

  it("is written year-month-day with zeros", () => {
    expect(aiDay(new Date("2026-03-05T18:00:00Z"))).toBe("2026-03-05");
  });
});

describe("cleanAiLimit", () => {
  it("accepts a whole number from 0 to 1000", () => {
    for (const ok of [0, 1, 10, 250, 1000]) expect(cleanAiLimit(ok)).toBe(ok);
  });

  it("refuses anything else", () => {
    for (const bad of [-1, 1001, 2.5, "10", null, undefined, NaN, Infinity]) expect(cleanAiLimit(bad)).toBeNull();
  });

  it("has a default inside that range", () => {
    expect(cleanAiLimit(DEFAULT_AI_DAILY_LIMIT)).toBe(DEFAULT_AI_DAILY_LIMIT);
  });
});

describe("shouldGiveBack", () => {
  it("gives the reading back when Gemini couldn't answer on its own side", () => {
    for (const status of [401, 403, 408, 429, 500, 502, 503]) expect(shouldGiveBack({ status })).toBe(true);
    expect(shouldGiveBack(new TypeError("fetch failed"))).toBe(true); // the connection dropped
  });

  it("keeps it when Gemini rejected the file itself", () => {
    for (const status of [400, 404, 413, 422]) expect(shouldGiveBack({ status })).toBe(false);
  });
});

describe("aiUsageRows", () => {
  it("lists every account with what it used today, most used first, then by email", () => {
    const users = [
      { id: "1", email: "b@example.com" },
      { id: "2", email: "a@example.com" },
      { id: "3", email: "c@example.com" },
      { id: "4", email: "d@example.com" },
    ];
    const usage = [
      { userId: "3", count: 7 },
      { userId: "1", count: 2 },
      { userId: "gone", count: 9 }, // an account that no longer exists
    ];
    expect(aiUsageRows(users, usage)).toEqual([
      { email: "c@example.com", used: 7 },
      { email: "b@example.com", used: 2 },
      { email: "a@example.com", used: 0 },
      { email: "d@example.com", used: 0 },
    ]);
  });

  it("gives only the email and the count", () => {
    const [row] = aiUsageRows([{ id: "1", email: "a@example.com", passwordHash: "secret" }], []);
    expect(Object.keys(row).sort()).toEqual(["email", "used"]);
  });
});

describe("aiLimitFailure", () => {
  const req = (lang) => ({ headers: { "x-lang": lang }, get: (h) => ({ "x-lang": lang })[h.toLowerCase()] });

  it("says the limit was reached, in the reader's language, with the number and a code", () => {
    const use = { ok: false, paused: false, limit: 10 };
    expect(aiLimitFailure(req("en"), use)).toEqual({
      error: "You've reached today's limit of 10 file readings (flyers and receipts). Try again tomorrow.",
      code: "aiLimit",
      limit: 10,
    });
    expect(aiLimitFailure(req("fr"), use)).toEqual({
      error: "Vous avez atteint la limite quotidienne de 10 lectures de fichiers (circulaires et reçus). Réessayez demain.",
      code: "aiLimit",
      limit: 10,
    });
  });

  it("says reading is paused when Matt set the limit to 0", () => {
    const use = { ok: false, paused: true, limit: 0 };
    expect(aiLimitFailure(req("en"), use).error).toMatch(/paused/);
    expect(aiLimitFailure(req("fr"), use).error).toMatch(/suspendue/);
    expect(aiLimitFailure(req("fr"), use).code).toBe("aiPaused");
  });
});

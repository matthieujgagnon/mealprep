import { describe, expect, it, vi } from "vitest";
import {
  FEEDBACK_BURST,
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_PER_DAY,
  browserLabel,
  cleanFeedbackInput,
  cleanMessage,
  feedbackLimitHit,
  feedbackRow,
  notifyFeedback,
} from "./feedback.js";

const good = { message: "The grocery list is empty", kind: "wrong", page: "grocery", locale: "fr", device: "phone", screen: "390x844", appVersion: "a1b2c3d" };

describe("cleanMessage", () => {
  it("trims, uses \\n for new lines and drops control characters (a NUL can't be stored)", () => {
    expect(cleanMessage("  hello\r\nworld\rbye\u0000\u0007  ")).toBe("hello\nworld\nbye");
  });
  it("keeps accents, emoji and tabs", () => {
    expect(cleanMessage("Très bon 🍅\tmerci")).toBe("Très bon 🍅\tmerci");
  });
  it("turns nothing into an empty string", () => {
    expect(cleanMessage(null)).toBe("");
    expect(cleanMessage(undefined)).toBe("");
  });
});

describe("cleanFeedbackInput", () => {
  it("keeps what the form sent, and reads the browser from the request", () => {
    const { data } = cleanFeedbackInput(good, { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1" });
    expect(data).toEqual({
      kind: "wrong",
      message: "The grocery list is empty",
      page: "grocery",
      locale: "fr",
      device: "phone",
      screen: "390x844",
      browser: "Safari 17 on iOS",
      appVersion: "a1b2c3d",
      errorName: null,
    });
  });

  it("refuses no words, only spaces, too many characters and an unknown kind", () => {
    expect(cleanFeedbackInput({ ...good, message: "" }).error).toBe("feedbackRequired");
    expect(cleanFeedbackInput({ ...good, message: "  \n\t " }).error).toBe("feedbackRequired");
    expect(cleanFeedbackInput({ ...good, message: undefined }).error).toBe("feedbackRequired");
    expect(cleanFeedbackInput({ ...good, kind: "praise" }).error).toBe("feedbackBadKind");
    expect(cleanFeedbackInput({ ...good, kind: undefined }).error).toBe("feedbackBadKind");
    expect(cleanFeedbackInput(null).error).toBe("feedbackRequired");
  });

  it("allows exactly the maximum and refuses one more", () => {
    expect(cleanFeedbackInput({ ...good, message: "a".repeat(FEEDBACK_MAX_LENGTH) }).data.message).toHaveLength(FEEDBACK_MAX_LENGTH);
    const over = cleanFeedbackInput({ ...good, message: "a".repeat(FEEDBACK_MAX_LENGTH + 1) });
    expect(over.error).toBe("feedbackTooLong");
    expect(over.vars).toEqual({ max: FEEDBACK_MAX_LENGTH });
  });

  it("never loses a feedback over a detail: one that looks wrong is stored as unknown", () => {
    const { data } = cleanFeedbackInput({ ...good, page: "<script>", device: "tablet", screen: "big", appVersion: "x".repeat(50), locale: "de" }, { lang: "en" });
    expect(data).toMatchObject({ page: "unknown", device: "unknown", screen: "unknown", appVersion: "unknown", locale: "en" });
  });

  it("takes the language from the request when the form didn't say", () => {
    expect(cleanFeedbackInput({ ...good, locale: undefined }, { lang: "en" }).data.locale).toBe("en");
    expect(cleanFeedbackInput({ ...good, locale: undefined }).data.locale).toBe("fr");
  });

  it("keeps an error's name, never anything that could be its text", () => {
    expect(cleanFeedbackInput({ ...good, errorName: "TypeError" }).data.errorName).toBe("TypeError");
    expect(cleanFeedbackInput({ ...good, errorName: "ChunkLoadError" }).data.errorName).toBe("ChunkLoadError");
    expect(cleanFeedbackInput({ ...good, errorName: "Cannot read properties of undefined (reading 'email')" }).data.errorName).toBeNull();
    expect(cleanFeedbackInput({ ...good, errorName: "a@b.com" }).data.errorName).toBeNull();
    expect(cleanFeedbackInput({ ...good, errorName: 42 }).data.errorName).toBeNull();
  });

  it("ignores anything else in the body (an id, a user id, a done date)", () => {
    const { data } = cleanFeedbackInput({ ...good, id: "x", userId: "someone-else", doneAt: "2026-01-01", createdAt: "2020-01-01" });
    expect(Object.keys(data).sort()).toEqual(["appVersion", "browser", "device", "errorName", "kind", "locale", "message", "page", "screen"]);
  });
});

describe("browserLabel", () => {
  const cases = [
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15", "Safari 17 on macOS"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", "Chrome 126 on Windows"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0", "Edge 126 on Windows"],
    ["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.6478.36 Safari/537.36", "Chrome 126 on Linux"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0", "Firefox 127 on macOS"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36", "Chrome 126 on Android"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1", "Chrome 126 on iOS"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15", "Firefox 127 on iOS"],
    ["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OPR/111.0.0.0", "Opera 111 on Linux"],
  ];
  for (const [ua, label] of cases) {
    it(label, () => expect(browserLabel(ua)).toBe(label));
  }
  it("says so when it can't tell, and never keeps the full text", () => {
    expect(browserLabel("")).toBe("Unknown browser");
    expect(browserLabel(undefined)).toBe("Unknown browser");
    expect(browserLabel("curl/8.0")).toBe("Unknown browser");
    expect(browserLabel("x".repeat(500)).length).toBeLessThanOrEqual(80);
  });
});

describe("feedbackLimitHit", () => {
  const now = new Date("2026-10-18T15:00:00Z"); // 11 a.m. in Quebec
  const ago = (ms) => new Date(now.getTime() - ms);
  const MIN = 60 * 1000;

  it("lets an account that has sent little send", () => {
    expect(feedbackLimitHit([], now)).toBeNull();
    expect(feedbackLimitHit([ago(MIN), ago(2 * MIN)], now)).toBeNull();
  });

  it("stops the 6th in 10 minutes, and lets it through once the first is 10 minutes old", () => {
    const five = [1, 2, 3, 4, 5].map((n) => ago(n * MIN));
    expect(FEEDBACK_BURST.count).toBe(5);
    expect(feedbackLimitHit(five, now)).toBe("feedbackBusy");
    expect(feedbackLimitHit([ago(11 * MIN), ...five.slice(1)], now)).toBeNull();
  });

  it("stops the 31st in a Quebec day, and counts a new day from Quebec midnight", () => {
    const thirty = Array.from({ length: FEEDBACK_PER_DAY }, (_, i) => ago((20 + i * 5) * MIN)); // spread out, all today
    expect(feedbackLimitHit(thirty, now)).toBe("feedbackDaily");
    // 5 a.m. UTC on the 19th is 1 a.m. in Quebec on the 19th: yesterday's thirty no longer count.
    expect(feedbackLimitHit(thirty, new Date("2026-10-19T05:00:00Z"))).toBeNull();
    // 3 a.m. UTC on the 19th is still the 18th, 11 p.m., in Quebec.
    expect(feedbackLimitHit(thirty, new Date("2026-10-19T03:00:00Z"))).toBe("feedbackDaily");
  });
});

describe("feedbackRow", () => {
  it("gives the inbox the sender's email and the details, never the user id", () => {
    const row = feedbackRow({ id: "f1", userId: "u1", user: { email: "a@example.com" }, kind: "idea", message: "hi", page: "home", locale: "en", device: "computer", screen: "1280x800", browser: "Chrome 126 on Windows", appVersion: "dev", errorName: null, createdAt: new Date(0), doneAt: null });
    expect(row.email).toBe("a@example.com");
    expect(row).not.toHaveProperty("userId");
    expect(Object.keys(row)).toEqual(["id", "email", "kind", "message", "page", "locale", "device", "screen", "browser", "appVersion", "errorName", "createdAt", "doneAt"]);
  });
});

describe("notifyFeedback", () => {
  const row = { id: "f1", kind: "idea", message: "hi" };

  it("sends nothing when FEEDBACK_EMAIL_TO isn't set", async () => {
    const send = vi.fn();
    expect(await notifyFeedback(row, "a@example.com", { to: undefined, send })).toBe(false);
    expect(await notifyFeedback(row, "a@example.com", { to: "   ", send })).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});

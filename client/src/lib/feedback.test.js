import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { setLang, t } from "../i18n/index.js";
import {
  COUNTER_FROM,
  DEFAULT_KIND,
  ERROR_KIND,
  ERROR_LABELS,
  FEEDBACK_KINDS,
  FEEDBACK_MAX_LENGTH,
  canSend,
  errorNameOf,
  feedbackContext,
  getCurrentPage,
  setCurrentPage,
  showCounter,
} from "./feedback.js";

const win = (width, height, phone) => ({ innerWidth: width, innerHeight: height, matchMedia: () => ({ matches: phone }) });

describe("the limits match the server's", () => {
  const server = readFileSync(new URL("../../../server/src/lib/feedback.js", import.meta.url), "utf8");
  it("the same maximum length and the same kinds", () => {
    expect(server).toContain(`export const FEEDBACK_MAX_LENGTH = ${FEEDBACK_MAX_LENGTH};`);
    expect(server).toContain(`export const FEEDBACK_KINDS = ${JSON.stringify(FEEDBACK_KINDS).replace(/,/g, ", ")};`);
  });
  it("every fixed label for an error is a name the server keeps", () => {
    const serverRule = new RegExp(server.match(/const ERROR_NAME = (\/.*\/);/)[1].slice(1, -1));
    for (const label of Object.values(ERROR_LABELS)) expect(label).toMatch(serverRule);
    expect(errorNameOf({ name: "TypeError" })).toMatch(serverRule);
  });
});

describe("the form's rules", () => {
  it("starts on Other from the menu and on Something's wrong from an error", () => {
    expect(DEFAULT_KIND).toBe("other");
    expect(ERROR_KIND).toBe("wrong");
    expect(FEEDBACK_KINDS).toContain(DEFAULT_KIND);
    expect(FEEDBACK_KINDS).toContain(ERROR_KIND);
  });

  it("shows the count only near the limit", () => {
    expect(showCounter("a".repeat(COUNTER_FROM - 1))).toBe(false);
    expect(showCounter("a".repeat(COUNTER_FROM))).toBe(true);
  });

  it("can send with words, not with only spaces, not while sending, not over the limit", () => {
    expect(canSend("Hello")).toBe(true);
    expect(canSend("")).toBe(false);
    expect(canSend("  \n ")).toBe(false);
    expect(canSend("Hello", true)).toBe(false);
    expect(canSend("a".repeat(FEEDBACK_MAX_LENGTH))).toBe(true);
    expect(canSend("a".repeat(FEEDBACK_MAX_LENGTH + 1))).toBe(false);
  });
});

describe("errorNameOf", () => {
  it("is the error's name, never its text", () => {
    expect(errorNameOf(new TypeError("Cannot read properties of undefined (reading 'email')"))).toBe("TypeError");
    expect(errorNameOf({ name: "ChunkLoadError", message: "Loading chunk 7 failed for matt@example.com" })).toBe("ChunkLoadError");
  });
  it("is plain Error for anything that isn't a clean name", () => {
    expect(errorNameOf(null)).toBe("Error");
    expect(errorNameOf("boom")).toBe("Error");
    expect(errorNameOf({ name: "has spaces and an @ sign" })).toBe("Error");
    expect(errorNameOf({ name: "x".repeat(100) })).toBe("Error");
  });
});

describe("what the app attaches by itself", () => {
  it("is the page, language, device, window size and version, and nothing else", () => {
    setLang("fr");
    const context = feedbackContext({ page: "planner", win: win(390.4, 844, true) });
    expect(context).toEqual({ page: "planner", locale: "fr", device: "phone", screen: "390x844", appVersion: "dev" });
  });

  it("says computer on a wide window, follows the language, and adds the error's name when there is one", () => {
    setLang("en");
    const context = feedbackContext({ page: "help", win: win(1280, 800, false), errorName: "TypeError" });
    expect(context).toEqual({ page: "help", locale: "en", device: "computer", screen: "1280x800", appVersion: "dev", errorName: "TypeError" });
  });

  it("uses the page App.jsx last set", () => {
    setCurrentPage("grocery");
    expect(getCurrentPage()).toBe("grocery");
    expect(feedbackContext({ win: win(1000, 700, false) }).page).toBe("grocery");
    setCurrentPage("");
    expect(getCurrentPage()).toBe("home");
  });

  it("has a sentence for each kind in both languages", () => {
    for (const lang of ["en", "fr"]) {
      for (const kind of FEEDBACK_KINDS) expect(t(`feedback.kinds.${kind}`, undefined, lang)).not.toBe(`feedback.kinds.${kind}`);
    }
  });
});

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";
import traverseMod from "@babel/traverse";

// A browser spec reads "today" from ONE place: the Quebec clock in e2e/spec-clock.js (the spec's moment: the
// real one, or the one E2E_NOW freezes the browser to) and e2e/quebec-day.js (the Quebec day, counted on its own).
// CI has failed three times in a week because a spec worked out "this week" or "today" from the machine it
// runs on (UTC in CI, a day ahead from 8 p.m. in Quebec) while the app counts Quebec days. These tests fail if
// a spec reads the machine's clock, or its time zone, directly. They read the code as a syntax tree, so a
// comment or a string never trips them, and they only know the patterns below: a new way of asking the machine
// for the time still has to come through spec-clock.js.
const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const traverse = traverseMod.default || traverseMod;

// The two files that hold the clock itself.
const THE_CLOCK = ["e2e/spec-clock.js", "e2e/quebec-day.js"];

// What reads the machine's own time zone, whatever moment they are given: the day, hour or month the machine
// is in, which is not the Quebec one.
const MACHINE_ZONE_METHODS = new Set([
  "getDay", "getDate", "getMonth", "getFullYear", "getYear", "getHours", "getMinutes", "getSeconds", "getMilliseconds", "getTimezoneOffset",
  "setDate", "setMonth", "setFullYear", "setHours", "setMinutes", "setSeconds", "setMilliseconds",
  "toLocaleDateString", "toLocaleTimeString", "toDateString", "toTimeString",
]);

// quebec-day.js functions that count from the real clock when they are not given the moment.
const NEEDS_THE_MOMENT = { quebecDay: 1, quebecDayIn: 2, quebecDayOfWeek: 1, quebecWeekStart: 1 };

// A date written out in full as a fixed moment: "2026-10-13T03:00:00Z", "2026-10-31T21:30:00-04:00", or a bare day,
// which is midnight UTC. A time with no zone ("2026-10-13T12:00:00") is read in the machine's zone.
const FIXED_MOMENT = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/;

function files(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...files(path));
    else if (/\.js$/.test(entry.name)) out.push(path);
  }
  return out;
}

// A fixed moment: written out with its zone, or a use-by day saved as midnight UTC (asSavedDay in quebec-day.js).
const isFixedMoment = (node) =>
  (node.type === "StringLiteral" && FIXED_MOMENT.test(node.value)) ||
  (node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "asSavedDay");

const isMember = (node, object, property) =>
  node.type === "MemberExpression" && !node.computed && node.object.type === "Identifier" && node.object.name === object && node.property.name === property;

// What is wrong with one e2e file, as short messages with the line. `path` is relative to the repo.
export function violations(path, text) {
  if (THE_CLOCK.includes(path)) return [];
  const out = [];
  const at = (node) => `line ${node.loc.start.line}`;
  traverse(parse(text, { sourceType: "module" }), {
    CallExpression(p) {
      const { callee, arguments: args } = p.node;
      // Date.now(): the machine's clock. Only as a piece of a template string ("name ${Date.now()}", an e-mail
      // address that must be new on every run) is it a name and not a time.
      if (isMember(callee, "Date", "now") && p.parent.type !== "TemplateLiteral") {
        out.push(`${at(p.node)}: Date.now() reads the machine's clock; use specNow() / realNow() from spec-clock.js`);
      }
      if (callee.type === "MemberExpression" && !callee.computed && MACHINE_ZONE_METHODS.has(callee.property.name)) {
        out.push(`${at(p.node)}: .${callee.property.name}() reads the machine's time zone; count Quebec days with quebec-day.js and spec-clock.js`);
      }
      if (callee.type === "Identifier" && callee.name in NEEDS_THE_MOMENT && args.length < NEEDS_THE_MOMENT[callee.name]) {
        out.push(`${at(p.node)}: ${callee.name}() without the moment counts from the real clock; pass specNow() (or the spec's own moment)`);
      }
    },
    NewExpression(p) {
      const { callee, arguments: args } = p.node;
      if (callee.type === "Identifier" && callee.name === "Date") {
        const first = args[0];
        if (!first) {
          out.push(`${at(p.node)}: new Date() reads the machine's clock; use specNow() / realNow() from spec-clock.js`);
        } else if (!isFixedMoment(first)) {
          out.push(`${at(p.node)}: new Date(...) is read in the machine's time zone unless it is a fixed moment written with its zone ("2026-10-13T03:00:00Z"); use quebecMoment() / todayAt() / realNow()`);
        }
      }
      if (callee.type === "MemberExpression" && isMember(callee, "Intl", "DateTimeFormat")) {
        out.push(`${at(p.node)}: Intl.DateTimeFormat belongs in quebec-day.js`);
      }
    },
    // A spec's test and expect come from spec-clock.js: that is what puts its browser in Quebec's time zone
    // and freezes it to E2E_NOW.
    ImportDeclaration(p) {
      if (/\.spec\.js$/.test(path) && p.node.source.value === "@playwright/test") {
        out.push(`${at(p.node)}: import test and expect from "./spec-clock.js", not "@playwright/test"`);
      }
    },
  });
  if (/\.spec\.js$/.test(path) && !/import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*"\.\/spec-clock\.js"/.test(text)) {
    out.push(`never imports test from "./spec-clock.js"`);
  }
  return out;
}

describe("a browser spec reads the day only from the Quebec clock", () => {
  it("no e2e file reads the machine's clock or time zone", () => {
    const found = [];
    for (const path of files(join(root, "e2e"))) {
      const rel = relative(root, path);
      for (const message of violations(rel, readFileSync(path, "utf8"))) found.push(`${rel}: ${message}`);
    }
    expect(found).toEqual([]);
  });

  it("the browser of every spec runs in Quebec's time zone, set in one place", () => {
    const clock = readFileSync(join(root, "e2e/spec-clock.js"), "utf8");
    expect(clock).toMatch(/timezoneId: \["America\/Toronto", \{ option: true \}\]/);
    // Nothing else sets it: a spec in another zone would count other days than the Quebec ones.
    const elsewhere = files(join(root, "e2e"))
      .map((path) => relative(root, path))
      .filter((rel) => !THE_CLOCK.includes(rel) && /timezoneId/.test(readFileSync(join(root, rel), "utf8")));
    expect(elsewhere).toEqual([]);
  });
});

// The checks above only mean something if they can fail: these are the mistakes they exist for.
describe("the guard catches the mistakes it is for", () => {
  const spec = "e2e/some.spec.js";
  const head = 'import { expect, test } from "./spec-clock.js";\n';
  const found = (code, path = spec) => violations(path, head + code);

  it("today read from the machine", () => {
    expect(found("const t = new Date();").join()).toContain("new Date() reads the machine's clock");
    expect(found("const t = Date.now();").join()).toContain("Date.now() reads the machine's clock");
    expect(found("const day = quebecDay(Date.now());").length).toBeGreaterThan(0);
    expect(found("const i = (new Date().getDay() + 6) % 7;").join()).toContain(".getDay() reads the machine's time zone");
  });

  it("a week start worked out by hand", () => {
    const old = "function mondayOf(d) { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }";
    expect(found(old).length).toBeGreaterThanOrEqual(3);
    expect(found("const noon = new Date(`${week}T12:00:00`);").join()).toContain("machine's time zone");
    expect(found("const d = new Date(2026, 9, 7, 12, 0, 0);").join()).toContain("machine's time zone");
    expect(found("evening.setHours(18, 0, 0, 0);").join()).toContain(".setHours()");
  });

  it("a Quebec day counted from the real clock", () => {
    expect(found("const d = quebecDayIn(3);").join()).toContain("without the moment");
    expect(found("const d = quebecDay();").join()).toContain("without the moment");
    expect(found("const d = quebecWeekStart();").length).toBe(1);
    expect(found("const d = quebecDayIn(3, specNow());")).toEqual([]);
    expect(found("const d = quebecDay(LATE_EVENING);")).toEqual([]);
  });

  it("a spec outside spec-clock.js", () => {
    expect(violations(spec, 'import { expect, test } from "@playwright/test";').join()).toContain("not \"@playwright/test\"");
    expect(violations(spec, "test('x', async () => {});").join()).toContain("never imports test");
    expect(violations("e2e/helper.js", 'import { expect } from "@playwright/test";')).toEqual([]);
  });

  it("what is allowed: a name that must be new, a fixed moment, the clock's own files", () => {
    expect(found("const email = `a+${Date.now()}@example.com`;")).toEqual([]);
    expect(found('const at = new Date("2026-10-13T03:00:00Z");')).toEqual([]);
    expect(found('const at = new Date("2026-10-31T21:30:00-04:00");')).toEqual([]);
    expect(found('const at = new Date("2026-10-31");')).toEqual([]);
    expect(found("const useBy = new Date(asSavedDay(day));")).toEqual([]);
    expect(found("const t = specNow().getTime(); const m = thisMonday(); const w = mondayAfter(1);")).toEqual([]);
    expect(violations("e2e/spec-clock.js", "export const specNow = () => new Date();")).toEqual([]);
    expect(violations("e2e/quebec-day.js", "export const x = Date.now();")).toEqual([]);
    // A comment that talks about it is not a read.
    expect(found("// new Date() and Date.now() are the machine's\nconst a = 1;")).toEqual([]);
    expect(found('const note = "new Date() is the machine\'s";')).toEqual([]);
  });
});

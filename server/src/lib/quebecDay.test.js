import { describe, expect, it } from "vitest";
import * as server from "./quebecDay.js";
import * as client from "../../../client/src/lib/quebecDay.js";

// The browser's copy of the Quebec-day rule (client/src/lib/quebecDay.js) must give
// the same answers as this server's.
describe("the client's quebecDay.js agrees with the server's", () => {
  // Every half hour around the clock changes, midnights and the ends of the year.
  const instants = [];
  for (const start of ["2026-03-08T04:00:00Z", "2026-11-01T03:00:00Z", "2026-12-31T20:00:00Z", "2028-02-28T20:00:00Z", "2026-10-12T00:00:00Z"]) {
    const from = Date.parse(start);
    for (let i = 0; i < 100; i++) instants.push(new Date(from + i * 30 * 60 * 1000));
  }

  it("names the same day for the same moment", () => {
    for (const at of instants) expect(client.quebecDay(at)).toBe(server.quebecDay(at));
  });

  it("reads a saved use-by date the same way", () => {
    const values = [...instants.map((d) => d.toISOString()), "2026-10-16", "2026-10-16T00:00:00.000Z", null, "", "nope"];
    for (const value of values) expect(client.expiryDay(value)).toBe(server.expiryDay(value));
  });

  it("moves and counts days the same way", () => {
    for (const [key, days] of [["2026-10-12", 4], ["2026-12-30", 3], ["2028-02-28", 2], ["2026-10-12", -20]]) {
      expect(client.addDays(key, days)).toBe(server.addDays(key, days));
      expect(client.daysBetween(key, server.addDays(key, days))).toBe(server.daysBetween(key, server.addDays(key, days)));
    }
  });
});

describe("keptDays", () => {
  it("counts from the day put away to the use-by day, whatever the hour", () => {
    // Put away at 9 a.m., 3 p.m. and 11 p.m. on Oct 12 in Quebec, for four days.
    for (const purchased of ["2026-10-12T13:00:00Z", "2026-10-12T19:00:00Z", "2026-10-13T03:00:00Z"]) {
      expect(server.keptDays(purchased, "2026-10-16T00:00:00.000Z")).toBe(4);
    }
  });

  it("is at least 1, and null without a use-by date", () => {
    expect(server.keptDays("2026-10-12T13:00:00Z", "2026-10-12T00:00:00.000Z")).toBe(1);
    expect(server.keptDays("2026-10-12T13:00:00Z", null)).toBeNull();
  });
});

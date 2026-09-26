import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { daysUntil, formatExpiry } from "./pantryInventory.js";

const NOW = new Date("2026-09-15T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("daysUntil", () => {
  it("counts whole days into the future", () => {
    expect(daysUntil("2026-09-20T12:00:00Z")).toBe(5);
  });

  it("is negative for a date already in the past", () => {
    expect(daysUntil("2026-09-10T12:00:00Z")).toBe(-5);
  });
});

describe("formatExpiry", () => {
  it("says 'No date set' when there's no date", () => {
    expect(formatExpiry(null)).toBe("No date set");
    expect(formatExpiry(undefined)).toBe("No date set");
  });

  it("says 'Expires today' for today", () => {
    expect(formatExpiry("2026-09-15T12:00:00Z")).toBe("Expires today");
  });

  it("says 'Expires tomorrow' for tomorrow, not 'in 1d'", () => {
    expect(formatExpiry("2026-09-16T12:00:00Z")).toBe("Expires tomorrow");
  });

  it("counts days out further ahead", () => {
    expect(formatExpiry("2026-09-20T12:00:00Z")).toBe("Expires in 5d");
  });

  it("reports how many days ago something expired", () => {
    expect(formatExpiry("2026-09-10T12:00:00Z")).toBe("Expired 5d ago");
  });
});

import { describe, expect, it } from "vitest";
import { adminEmails, isAdminEmail, listedWithoutAccount, memberRows, normalizeEmail, roleFor } from "./admin.js";

describe("ADMIN_EMAILS", () => {
  it("is read as trimmed, lowercased emails, skipping empty entries", () => {
    expect([...adminEmails(" Matt@Example.com ,friend@example.com,, ")]).toEqual(["matt@example.com", "friend@example.com"]);
    expect(adminEmails(undefined).size).toBe(0);
    expect(adminEmails("").size).toBe(0);
  });

  it("matches an account's email trimmed and lowercased, on both sides", () => {
    expect(normalizeEmail("  MATT@example.COM ")).toBe("matt@example.com");
    expect(isAdminEmail(" MATT@Example.com", "matt@example.com")).toBe(true);
    expect(isAdminEmail("matt@example.com", "  MATT@EXAMPLE.COM  ")).toBe(true);
    expect(isAdminEmail("other@example.com", "matt@example.com")).toBe(false);
    expect(isAdminEmail("", "matt@example.com")).toBe(false);
    expect(isAdminEmail(null, "")).toBe(false);
  });

  it("is the only thing that makes an admin: a stored role of admin grants nothing", () => {
    expect(roleFor({ email: "matt@example.com", role: "member" }, "matt@example.com")).toBe("admin");
    expect(roleFor({ email: "friend@example.com", role: "admin" }, "matt@example.com")).toBe("member");
    expect(roleFor({ email: "friend@example.com", role: "admin" }, "")).toBe("member");
  });

  it("finds the listed emails that have no account", () => {
    const listed = adminEmails("matt@example.com, ghost@example.com");
    expect(listedWithoutAccount(listed, ["Matt@Example.com"])).toEqual(["ghost@example.com"]);
    expect(listedWithoutAccount(listed, ["matt@example.com", "ghost@example.com"])).toEqual([]);
  });
});

describe("memberRows", () => {
  const user = (email, createdAt, lastActiveAt, lastSignIn) => ({
    id: `id-${email}`,
    name: "Someone",
    passwordHash: "secret",
    email,
    createdAt: new Date(createdAt),
    lastActiveAt: lastActiveAt ? new Date(lastActiveAt) : null,
    sessions: lastSignIn ? [{ createdAt: new Date(lastSignIn) }] : [],
  });

  it("gives only the email, the signup date and last active", () => {
    const [row] = memberRows([user("a@example.com", "2026-09-01", "2026-10-10")]);
    expect(Object.keys(row).sort()).toEqual(["email", "lastActiveAt", "signedUpAt"]);
    expect(row).toEqual({ email: "a@example.com", signedUpAt: new Date("2026-09-01"), lastActiveAt: new Date("2026-10-10") });
  });

  it("uses the newest sign-in until last active is recorded, and null without one", () => {
    const rows = memberRows([user("a@example.com", "2026-09-01", null, "2026-10-05"), user("b@example.com", "2026-09-02")]);
    expect(rows.map((r) => [r.email, r.lastActiveAt])).toEqual([
      ["a@example.com", new Date("2026-10-05")],
      ["b@example.com", null],
    ]);
  });

  it("puts the most recently active first, then never-seen accounts by newest signup", () => {
    const rows = memberRows([
      user("old@example.com", "2026-09-01", "2026-10-01"),
      user("new@example.com", "2026-09-05", "2026-10-11"),
      user("quiet-1@example.com", "2026-09-02"),
      user("quiet-2@example.com", "2026-09-03"),
    ]);
    expect(rows.map((r) => r.email)).toEqual(["new@example.com", "old@example.com", "quiet-2@example.com", "quiet-1@example.com"]);
  });
});

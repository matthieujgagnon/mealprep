import express from "express";
import cookieParser from "cookie-parser";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";
import { requireAuth } from "./auth.js";
import { requireAdmin } from "./admin.js";
import { generateCode } from "./invites.js";
import { FEEDBACK_BURST, FEEDBACK_MAX_LENGTH, FEEDBACK_PER_DAY } from "./feedback.js";
import { authRouter } from "../routes/auth.js";
import { adminRouter } from "../routes/admin.js";
import { feedbackRouter } from "../routes/feedback.js";

// The Feedback form and the Admin Feedback inbox against the real database,
// through the same mounting as server/src/index.js. Skipped when no database is
// reachable.
let dbUp = true;
try {
  await prisma.$queryRaw`SELECT 1`;
  await prisma.feedback.count();
} catch {
  dbUp = false;
}

describe.skipIf(!dbUp)("/api/feedback and /api/admin/feedback", () => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const adminEmail = `fb-admin-${stamp}@example.com`;
  const testerEmail = `fb-tester-${stamp}@example.com`;
  const otherEmail = `fb-other-${stamp}@example.com`;
  let server;
  let base;
  let invite;
  let savedEnv;
  const created = [];
  const FF = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0";
  const send = { message: "The list is empty after I add a recipe", kind: "wrong", page: "grocery", locale: "en", device: "computer", screen: "1280x800", appVersion: "a1b2c3d" };

  async function call(path, { cookie, method = "GET", body, headers } = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, cookie: res.headers.get("set-cookie")?.split(";")[0], data: await res.json().catch(() => null) };
  }

  async function account(email) {
    const res = await call("/api/auth/signup", { method: "POST", body: { email, password: "longenough1", inviteCode: invite.code } });
    expect(res.status).toBe(201);
    const user = await prisma.user.findUnique({ where: { email } });
    created.push(user.id);
    return { cookie: res.cookie, id: user.id };
  }

  let admin;
  let tester;
  let other;

  beforeAll(async () => {
    savedEnv = { ADMIN_EMAILS: process.env.ADMIN_EMAILS, FEEDBACK_EMAIL_TO: process.env.FEEDBACK_EMAIL_TO };
    delete process.env.FEEDBACK_EMAIL_TO; // no email in these tests
    invite = await prisma.inviteCode.create({ data: { code: generateCode(), maxUses: 10 } });
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use("/api/auth", authRouter);
    app.use("/api/feedback", requireAuth, feedbackRouter);
    app.use("/api/admin", requireAuth, requireAdmin, adminRouter);
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
    process.env.ADMIN_EMAILS = "";
    admin = await account(adminEmail);
    tester = await account(testerEmail);
    other = await account(otherEmail);
    process.env.ADMIN_EMAILS = adminEmail;
  });

  afterAll(async () => {
    for (const key of Object.keys(savedEnv)) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    await prisma.user.deleteMany({ where: { id: { in: created } } });
    await prisma.inviteCode.delete({ where: { id: invite.id } });
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  });

  it("refuses a visitor with 401 and saves nothing", async () => {
    const before = await prisma.feedback.count();
    expect((await call("/api/feedback", { method: "POST", body: send })).status).toBe(401);
    expect(await prisma.feedback.count()).toBe(before);
  });

  it("saves what a signed-in tester sends with the details the app adds, and the time from the server", async () => {
    const res = await call("/api/feedback", { method: "POST", cookie: tester.cookie, body: { ...send, id: "mine", userId: other.id, doneAt: "2020-01-01" }, headers: { "User-Agent": FF } });
    expect(res.status).toBe(201);
    const row = await prisma.feedback.findUnique({ where: { id: res.data.id } });
    expect(row).toMatchObject({
      userId: tester.id,
      kind: "wrong",
      message: send.message,
      page: "grocery",
      locale: "en",
      device: "computer",
      screen: "1280x800",
      browser: "Firefox 127 on macOS",
      appVersion: "a1b2c3d",
      errorName: null,
      doneAt: null,
    });
    expect(row.id).not.toBe("mine");
    expect(Math.abs(Date.now() - row.createdAt.getTime())).toBeLessThan(60_000);
  });

  it("answers 400 in the reader's language for no words, too many, or an unknown kind, and saves nothing", async () => {
    const before = await prisma.feedback.count({ where: { userId: other.id } });
    const empty = await call("/api/feedback", { method: "POST", cookie: other.cookie, body: { ...send, message: "   " }, headers: { "X-Lang": "fr" } });
    expect(empty.status).toBe(400);
    expect(empty.data.error).toBe("Écrivez d'abord quelques mots.");
    const long = await call("/api/feedback", { method: "POST", cookie: other.cookie, body: { ...send, message: "x".repeat(FEEDBACK_MAX_LENGTH + 1) } });
    expect(long.status).toBe(400);
    expect(long.data.error).toContain(String(FEEDBACK_MAX_LENGTH));
    const kind = await call("/api/feedback", { method: "POST", cookie: other.cookie, body: { ...send, kind: "praise" } });
    expect(kind.status).toBe(400);
    expect(await prisma.feedback.count({ where: { userId: other.id } })).toBe(before);
  });

  it("keeps only the error's name from the crash screen", async () => {
    const res = await call("/api/feedback", { method: "POST", cookie: other.cookie, body: { ...send, kind: "wrong", errorName: "TypeError" } });
    expect(res.status).toBe(201);
    expect((await prisma.feedback.findUnique({ where: { id: res.data.id } })).errorName).toBe("TypeError");
  });

  it("stops a burst: 5 in 10 minutes, then 429 in the reader's language, and other accounts are unaffected", async () => {
    const burst = await account(`fb-burst-${stamp}@example.com`);
    for (let i = 0; i < FEEDBACK_BURST.count; i++) {
      expect((await call("/api/feedback", { method: "POST", cookie: burst.cookie, body: send })).status).toBe(201);
    }
    const sixth = await call("/api/feedback", { method: "POST", cookie: burst.cookie, body: send, headers: { "X-Lang": "fr" } });
    expect(sixth.status).toBe(429);
    expect(sixth.data.error).toContain("plusieurs");
    expect(await prisma.feedback.count({ where: { userId: burst.id } })).toBe(FEEDBACK_BURST.count);
    expect((await call("/api/feedback", { method: "POST", cookie: other.cookie, body: send })).status).toBe(201);
  });

  it("stops the 31st in a day even when the burst window has passed", async () => {
    const daily = await account(`fb-daily-${stamp}@example.com`);
    const hourAgo = Date.now() - 60 * 60 * 1000;
    // Spread over the last 3 hours, all older than 10 minutes: only the day's count can stop it.
    await prisma.feedback.createMany({
      data: Array.from({ length: FEEDBACK_PER_DAY }, (_, i) => ({
        userId: daily.id,
        kind: "idea",
        message: `older ${i}`,
        page: "home",
        locale: "en",
        device: "computer",
        screen: "1280x800",
        browser: "x",
        appVersion: "dev",
        createdAt: new Date(hourAgo - i * 5 * 60 * 1000),
      })),
    });
    // 30 sent an hour ago may straddle Quebec midnight in the early hours; the point is the count.
    const res = await call("/api/feedback", { method: "POST", cookie: daily.cookie, body: send });
    const lastSentToday = new Date(hourAgo - (FEEDBACK_PER_DAY - 1) * 5 * 60 * 1000);
    const sameQuebecDay = lastSentToday.toLocaleDateString("en-CA", { timeZone: "America/Toronto" }) === new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
    expect(res.status).toBe(sameQuebecDay ? 429 : 201);
  });

  describe("the Feedback inbox (admin only)", () => {
    it("refuses a visitor with 401 and a tester with 403, on every admin feedback route", async () => {
      const id = (await prisma.feedback.findFirst({ where: { userId: tester.id } })).id;
      expect((await call("/api/admin/feedback")).status).toBe(401);
      expect((await call(`/api/admin/feedback/${id}`, { method: "PATCH", body: { done: true } })).status).toBe(401);
      expect((await call("/api/admin/feedback", { cookie: tester.cookie })).status).toBe(403);
      expect((await call(`/api/admin/feedback/${id}`, { method: "PATCH", cookie: tester.cookie, body: { done: true } })).status).toBe(403);
      expect((await prisma.feedback.findUnique({ where: { id } })).doneAt).toBeNull();
    });

    it("lists everything newest first with who sent it and the details, and counts what is not done", async () => {
      const res = await call("/api/admin/feedback", { cookie: admin.cookie });
      expect(res.status).toBe(200);
      const times = res.data.items.map((item) => new Date(item.createdAt).getTime());
      expect(times).toEqual([...times].sort((a, b) => b - a));
      const mine = res.data.items.find((item) => item.email === testerEmail);
      expect(mine).toMatchObject({ kind: "wrong", message: send.message, page: "grocery", locale: "en", device: "computer", screen: "1280x800", browser: "Firefox 127 on macOS", appVersion: "a1b2c3d", doneAt: null });
      expect(mine).not.toHaveProperty("userId");
      expect(res.data.notDone).toBe(await prisma.feedback.count({ where: { doneAt: null } }));
      expect(res.data.total).toBe(await prisma.feedback.count());
    });

    it("ticks Done and un-ticks it", async () => {
      const id = (await prisma.feedback.findFirst({ where: { userId: tester.id } })).id;
      const done = await call(`/api/admin/feedback/${id}`, { method: "PATCH", cookie: admin.cookie, body: { done: true } });
      expect(done.status).toBe(200);
      expect(done.data.doneAt).toBeTruthy();
      expect((await prisma.feedback.findUnique({ where: { id } })).doneAt).toBeInstanceOf(Date);
      const undone = await call(`/api/admin/feedback/${id}`, { method: "PATCH", cookie: admin.cookie, body: { done: false } });
      expect(undone.data.doneAt).toBeNull();
    });

    it("refuses a bad Done and an unknown feedback", async () => {
      const id = (await prisma.feedback.findFirst({ where: { userId: tester.id } })).id;
      expect((await call(`/api/admin/feedback/${id}`, { method: "PATCH", cookie: admin.cookie, body: { done: "yes" } })).status).toBe(400);
      expect((await call("/api/admin/feedback/nope", { method: "PATCH", cookie: admin.cookie, body: { done: true } })).status).toBe(404);
    });

    it("can't change anything but the tick (the words stay as they were sent)", async () => {
      const before = await prisma.feedback.findFirst({ where: { userId: tester.id } });
      await call(`/api/admin/feedback/${before.id}`, { method: "PATCH", cookie: admin.cookie, body: { done: true, message: "rewritten", kind: "idea" } });
      const after = await prisma.feedback.findUnique({ where: { id: before.id } });
      expect(after.message).toBe(before.message);
      expect(after.kind).toBe(before.kind);
    });
  });

  it("is deleted with its user", async () => {
    const gone = await account(`fb-gone-${stamp}@example.com`);
    await call("/api/feedback", { method: "POST", cookie: gone.cookie, body: send });
    expect(await prisma.feedback.count({ where: { userId: gone.id } })).toBe(1);
    await prisma.user.delete({ where: { id: gone.id } });
    expect(await prisma.feedback.count({ where: { userId: gone.id } })).toBe(0);
  });
});

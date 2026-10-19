import express from "express";
import cookieParser from "cookie-parser";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";
import { requireAuth } from "./auth.js";
import { requireAdmin } from "./admin.js";
import { generateCode } from "./invites.js";
import { FEEDBACK_BURST, FEEDBACK_LIST_LIMIT, FEEDBACK_MAX_LENGTH, FEEDBACK_PER_DAY } from "./feedback.js";
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
    invite = await prisma.inviteCode.create({ data: { code: generateCode(), maxUses: 20 } });
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
    const rowData = (userId, extra = {}) => ({
      userId,
      kind: "idea",
      message: "archive test",
      page: "home",
      locale: "en",
      device: "computer",
      screen: "1280x800",
      browser: "x",
      appVersion: "dev",
      ...extra,
    });
    const patch = (id, body, cookie = admin.cookie) => call(`/api/admin/feedback/${id}`, { method: "PATCH", cookie, body });
    const list = (box = "inbox") => call(`/api/admin/feedback?box=${box}`, { cookie: admin.cookie });
    const ids = (res) => res.data.items.map((item) => item.id);
    const counts = async () => (await list()).data.counts;

    it("refuses a visitor with 401 and a tester with 403, on every admin feedback route", async () => {
      const id = (await prisma.feedback.findFirst({ where: { userId: tester.id } })).id;
      expect((await call("/api/admin/feedback")).status).toBe(401);
      expect((await call(`/api/admin/feedback/${id}`, { method: "PATCH", body: { done: true } })).status).toBe(401);
      expect((await call("/api/admin/feedback", { cookie: tester.cookie })).status).toBe(403);
      expect((await call(`/api/admin/feedback/${id}`, { method: "PATCH", cookie: tester.cookie, body: { done: true } })).status).toBe(403);
      expect((await prisma.feedback.findUnique({ where: { id } })).doneAt).toBeNull();
    });

    it("refuses a visitor with 401 and a tester with 403 on archive, back to inbox, archive all done and the archive list, and archives nothing", async () => {
      const owner = await account(`fb-guard-${stamp}@example.com`);
      const done = await prisma.feedback.create({ data: rowData(owner.id, { message: "guarded", doneAt: new Date() }) });
      const archived = await prisma.feedback.create({ data: rowData(owner.id, { message: "guarded archived", archivedAt: new Date(Date.now() - 86400000) }) });
      const calls = [
        ["/api/admin/feedback?box=archive", "GET", undefined],
        [`/api/admin/feedback/${done.id}`, "PATCH", { archived: true }],
        [`/api/admin/feedback/${archived.id}`, "PATCH", { archived: false }],
        ["/api/admin/feedback/archive-done", "POST", undefined],
        ["/api/admin/feedback/unarchive", "POST", { ids: [archived.id] }],
      ];
      for (const [path, method, body] of calls) {
        expect((await call(path, { method, body })).status, `${method} ${path} as a visitor`).toBe(401);
        expect((await call(path, { method, body, cookie: tester.cookie })).status, `${method} ${path} as a tester`).toBe(403);
      }
      expect((await prisma.feedback.findUnique({ where: { id: done.id } })).archivedAt).toBeNull();
      expect((await prisma.feedback.findUnique({ where: { id: archived.id } })).archivedAt).toBeInstanceOf(Date);
    });

    it("lists the inbox newest first with who sent it and the details, and counts every box and what is not done", async () => {
      const res = await call("/api/admin/feedback", { cookie: admin.cookie });
      expect(res.status).toBe(200);
      const times = res.data.items.map((item) => new Date(item.createdAt).getTime());
      expect(times).toEqual([...times].sort((a, b) => b - a));
      const mine = res.data.items.find((item) => item.email === testerEmail);
      expect(mine).toMatchObject({ kind: "wrong", message: send.message, page: "grocery", locale: "en", device: "computer", screen: "1280x800", browser: "Firefox 127 on macOS", appVersion: "a1b2c3d", doneAt: null, archivedAt: null });
      expect(mine).not.toHaveProperty("userId");
      expect(res.data.counts).toEqual({
        inbox: await prisma.feedback.count({ where: { archivedAt: null } }),
        archive: await prisma.feedback.count({ where: { archivedAt: { not: null } } }),
        notDone: await prisma.feedback.count({ where: { archivedAt: null, doneAt: null } }),
      });
      expect(res.data.nextCursor).toBeNull();
    });

    it("ticks Done and un-ticks it", async () => {
      const id = (await prisma.feedback.findFirst({ where: { userId: tester.id } })).id;
      const done = await patch(id, { done: true });
      expect(done.status).toBe(200);
      expect(done.data.item.doneAt).toBeTruthy();
      expect((await prisma.feedback.findUnique({ where: { id } })).doneAt).toBeInstanceOf(Date);
      const undone = await patch(id, { done: false });
      expect(undone.data.item.doneAt).toBeNull();
    });

    it("refuses a bad Done or Archive, nothing to change, and an unknown feedback", async () => {
      const id = (await prisma.feedback.findFirst({ where: { userId: tester.id } })).id;
      expect((await patch(id, { done: "yes" })).status).toBe(400);
      expect((await patch(id, { archived: "yes" })).status).toBe(400);
      expect((await patch(id, { archived: true, done: 1 })).status).toBe(400);
      expect((await patch(id, {})).status).toBe(400);
      expect((await patch("nope", { done: true })).status).toBe(404);
      expect((await patch("nope", { archived: true })).status).toBe(404);
      expect((await prisma.feedback.findUnique({ where: { id } })).archivedAt).toBeNull();
    });

    it("can't change anything but Done and Archive (the words stay as they were sent)", async () => {
      const before = await prisma.feedback.findFirst({ where: { userId: tester.id } });
      await patch(before.id, { done: true, message: "rewritten", kind: "idea" });
      const after = await prisma.feedback.findUnique({ where: { id: before.id } });
      expect(after.message).toBe(before.message);
      expect(after.kind).toBe(before.kind);
    });

    it("archives one: out of the inbox, into the archive, Done untouched, counts move, nothing deleted", async () => {
      const ownerEmail = `fb-arch1-${stamp}@example.com`;
      const owner = await account(ownerEmail);
      const row = await prisma.feedback.create({ data: rowData(owner.id, { message: `archive me ${stamp}` }) });
      const before = await counts();
      const total = await prisma.feedback.count();

      const res = await patch(row.id, { archived: true });
      expect(res.status).toBe(200);
      expect(res.data.item.archivedAt).toBeTruthy();
      expect(res.data.item.doneAt).toBeNull(); // archiving doesn't tick Done
      expect(res.data.counts).toEqual({ inbox: before.inbox - 1, archive: before.archive + 1, notDone: before.notDone - 1 });

      expect(ids(await list("inbox"))).not.toContain(row.id);
      const archive = await list("archive");
      expect(ids(archive)).toContain(row.id);
      expect(archive.data.items.find((item) => item.id === row.id)).toMatchObject({ message: row.message, email: ownerEmail, doneAt: null });
      expect(archive.data.counts).toEqual(res.data.counts);

      // Archiving again keeps the first date, and nothing was ever removed.
      expect((await patch(row.id, { archived: true })).data.item.archivedAt).toBe(res.data.item.archivedAt);
      expect(await prisma.feedback.count()).toBe(total);
      expect(await prisma.feedback.findUnique({ where: { id: row.id } })).toMatchObject({ message: row.message, doneAt: null });
    });

    it("Back to inbox puts it back, and it is still done if it was done", async () => {
      const owner = await account(`fb-arch2-${stamp}@example.com`);
      const row = await prisma.feedback.create({ data: rowData(owner.id, { doneAt: new Date(), archivedAt: new Date() }) });
      const before = await counts();

      const res = await patch(row.id, { archived: false });
      expect(res.status).toBe(200);
      expect(res.data.item.archivedAt).toBeNull();
      expect(res.data.item.doneAt).toBeTruthy();
      expect(res.data.counts).toEqual({ inbox: before.inbox + 1, archive: before.archive - 1, notDone: before.notDone });
      expect(ids(await list("inbox"))).toContain(row.id);
      expect(ids(await list("archive"))).not.toContain(row.id);
    });

    it("keeps Done and Archive apart: ticking Done in the archive moves nothing, and only the inbox counts as to do", async () => {
      const owner = await account(`fb-arch3-${stamp}@example.com`);
      const row = await prisma.feedback.create({ data: rowData(owner.id, { archivedAt: new Date() }) });
      const before = await counts();

      const ticked = await patch(row.id, { done: true });
      expect(ticked.data.item).toMatchObject({ archivedAt: expect.any(String), doneAt: expect.any(String) });
      expect(ticked.data.counts).toEqual(before); // an archived one is never "to do", ticked or not
      expect(ids(await list("archive"))).toContain(row.id);
      expect(ids(await list("inbox"))).not.toContain(row.id);
    });

    it("archive all done moves only the done ones in the inbox, and its Undo puts back exactly those", async () => {
      const owner = await account(`fb-arch4-${stamp}@example.com`);
      const earlier = new Date(Date.now() - 86400000);
      const [doneA, doneB, open, archivedBefore] = await Promise.all([
        prisma.feedback.create({ data: rowData(owner.id, { message: "done A", doneAt: new Date() }) }),
        prisma.feedback.create({ data: rowData(owner.id, { message: "done B", doneAt: new Date() }) }),
        prisma.feedback.create({ data: rowData(owner.id, { message: "not done" }) }),
        prisma.feedback.create({ data: rowData(owner.id, { message: "archived yesterday", doneAt: earlier, archivedAt: earlier }) }),
      ]);
      const before = await counts();
      const total = await prisma.feedback.count();

      const res = await call("/api/admin/feedback/archive-done", { method: "POST", cookie: admin.cookie });
      expect(res.status).toBe(200);
      expect(res.data.ids).toEqual(expect.arrayContaining([doneA.id, doneB.id]));
      expect(res.data.ids).not.toContain(open.id);
      expect(res.data.ids).not.toContain(archivedBefore.id); // archived earlier: not part of this action
      expect(res.data.counts).toEqual({ inbox: before.inbox - res.data.ids.length, archive: before.archive + res.data.ids.length, notDone: before.notDone });
      const moved = await prisma.feedback.findMany({ where: { id: { in: [doneA.id, doneB.id] } } });
      for (const row of moved) expect(row).toMatchObject({ archivedAt: expect.any(Date), doneAt: expect.any(Date) });
      expect((await prisma.feedback.findUnique({ where: { id: open.id } })).archivedAt).toBeNull();
      expect((await prisma.feedback.findUnique({ where: { id: archivedBefore.id } })).archivedAt.getTime()).toBe(earlier.getTime());

      // Nothing is left to move, so a second press moves nothing.
      expect((await call("/api/admin/feedback/archive-done", { method: "POST", cookie: admin.cookie })).data.ids).toEqual([]);

      // Undo: exactly the ids it moved come back; what was archived yesterday stays archived.
      const undo = await call("/api/admin/feedback/unarchive", { method: "POST", cookie: admin.cookie, body: { ids: res.data.ids } });
      expect(undo.status).toBe(200);
      expect(undo.data.moved).toBe(res.data.ids.length);
      expect(undo.data.counts).toEqual(before);
      const back = await prisma.feedback.findMany({ where: { id: { in: [doneA.id, doneB.id] } } });
      for (const row of back) expect(row).toMatchObject({ archivedAt: null, doneAt: expect.any(Date) });
      expect((await prisma.feedback.findUnique({ where: { id: archivedBefore.id } })).archivedAt.getTime()).toBe(earlier.getTime());
      expect(await prisma.feedback.count()).toBe(total);
    });

    it("refuses an Undo without a list of ids, and leaves an unarchived or unknown id alone", async () => {
      for (const body of [undefined, {}, { ids: [] }, { ids: "abc" }, { ids: [1] }, { ids: [null] }]) {
        expect((await call("/api/admin/feedback/unarchive", { method: "POST", cookie: admin.cookie, body })).status).toBe(400);
      }
      const inboxRow = await prisma.feedback.findFirst({ where: { userId: tester.id, archivedAt: null } });
      const res = await call("/api/admin/feedback/unarchive", { method: "POST", cookie: admin.cookie, body: { ids: [inboxRow.id, "nope"] } });
      expect(res.status).toBe(200);
      expect(res.data.moved).toBe(0);
      expect((await prisma.feedback.findUnique({ where: { id: inboxRow.id } })).archivedAt).toBeNull();
    });

    it("refuses a box that does not exist and a cursor that is not one", async () => {
      expect((await call("/api/admin/feedback?box=trash", { cookie: admin.cookie })).status).toBe(400);
      expect((await call("/api/admin/feedback?box=archive&before=nope", { cookie: admin.cookie })).status).toBe(400);
    });

    it("pages a box 200 at a time with 'Show older': newest first, none twice or missing (even when many share one time), counts over everything", async () => {
      const pagerEmail = `fb-pager-${stamp}@example.com`;
      const pager = await account(pagerEmail);
      const sentAt = new Date("2000-01-01T00:00:00.000Z"); // the same time on all of them: only the id tells them apart
      const count = FEEDBACK_LIST_LIMIT + 5;
      await prisma.feedback.createMany({ data: Array.from({ length: count }, (_, i) => rowData(pager.id, { message: `old ${i}`, createdAt: sentAt, archivedAt: new Date() })) });

      const seen = [];
      let before;
      let pages = 0;
      let last;
      do {
        const res = await call(`/api/admin/feedback?box=archive${before ? `&before=${encodeURIComponent(before)}` : ""}`, { cookie: admin.cookie });
        expect(res.status).toBe(200);
        if (res.data.nextCursor) expect(res.data.items).toHaveLength(FEEDBACK_LIST_LIMIT);
        else expect(res.data.items.length).toBeLessThanOrEqual(FEEDBACK_LIST_LIMIT);
        if (pages === 0) expect(res.data.counts.archive).toBeGreaterThan(res.data.items.length); // counted over everything, not just this page
        seen.push(...res.data.items);
        last = res;
        before = res.data.nextCursor;
        pages++;
      } while (before && pages < 10);

      expect(pages).toBeGreaterThan(1);
      expect(seen.filter((item) => item.email === pagerEmail)).toHaveLength(count);
      expect(new Set(seen.map((item) => item.id)).size).toBe(seen.length); // none twice
      expect(seen).toHaveLength(last.data.counts.archive); // none missing
      const times = seen.map((item) => new Date(item.createdAt).getTime());
      expect(times).toEqual([...times].sort((a, b) => b - a));
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

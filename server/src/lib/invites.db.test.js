import express from "express";
import cookieParser from "cookie-parser";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Gemini is never called: the flyer and receipt routes get this stand-in, which
// answers (or fails) as each test says.
const gemini = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }
  return { generateContent: null, ApiError };
});
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: (...args) => gemini.generateContent(...args) };
  },
  Type: new Proxy({}, { get: (_, name) => String(name) }),
  ApiError: gemini.ApiError,
}));

const { prisma } = await import("./prisma.js");
const { requireAuth } = await import("./auth.js");
const { requireAdmin } = await import("./admin.js");
const { generateCode } = await import("./invites.js");
const { aiDay } = await import("./aiLimit.js");
const { authRouter } = await import("../routes/auth.js");
const { adminRouter } = await import("../routes/admin.js");
const { receiptsRouter } = await import("../routes/receipts.js");
const { flyersRouter } = await import("../routes/flyers.js");

// Invite-only signup, the Admin invite codes and the daily limit on Gemini
// readings, against the real database through the same mounting as
// server/src/index.js. Skipped when no database is reachable.
let dbUp = true;
try {
  await prisma.$queryRaw`SELECT 1`;
} catch {
  dbUp = false;
}

describe.skipIf(!dbUp)("invite codes and the daily AI limit", () => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const adminEmail = `invite-admin-${stamp}@example.com`;
  const emailFor = (name) => `${name}-${stamp}@example.com`;
  let server;
  let base;
  let savedAdminEmails;
  let savedSettings;
  let adminCookie;
  let adminId;
  const createdUsers = [];
  const createdCodes = [];

  async function call(path, { cookie, method = "GET", body, lang, form } = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(form ? {} : { "Content-Type": "application/json" }),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(lang ? { "X-Lang": lang } : {}),
      },
      body: form ?? (body ? JSON.stringify(body) : undefined),
    });
    return { status: res.status, cookie: res.headers.get("set-cookie")?.split(";")[0], data: await res.json().catch(() => null) };
  }

  const signup = (email, inviteCode, extra = {}) =>
    call("/api/auth/signup", { method: "POST", body: { email, password: "longenough1", inviteCode, ...extra.body }, lang: extra.lang });

  // A code made straight in the database, for the tests that need a particular state.
  async function makeCode(data = {}) {
    const invite = await prisma.inviteCode.create({ data: { code: generateCode(), ...data } });
    createdCodes.push(invite.id);
    return invite;
  }

  // An account that signed up with a (new, roomy) code, tracked for clean-up.
  async function member(name) {
    const invite = await makeCode({ maxUses: 5 });
    const res = await signup(emailFor(name), invite.code);
    expect(res.status).toBe(201);
    createdUsers.push(res.data.id);
    return { cookie: res.cookie, id: res.data.id, email: emailFor(name) };
  }

  function pdfForm(extra = {}) {
    const form = new FormData();
    form.append("file", new Blob(["%PDF-1.4 fake"], { type: "application/pdf" }), "receipt.pdf");
    for (const [key, value] of Object.entries(extra)) form.append(key, value);
    return form;
  }

  const readReceipt = (cookie, lang) => call("/api/receipts/parse", { method: "POST", cookie, form: pdfForm(), lang });
  const readFlyer = (cookie, lang) => call("/api/flyers/upload", { method: "POST", cookie, form: pdfForm({ store: "Metro" }), lang });
  const usedToday = async (userId) => (await prisma.aiUsage.findUnique({ where: { userId_day: { userId, day: aiDay() } } }))?.count ?? 0;

  beforeAll(async () => {
    savedAdminEmails = process.env.ADMIN_EMAILS;
    savedSettings = await prisma.appSettings.findUnique({ where: { id: "app" } });
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use("/api/auth", authRouter);
    app.use("/api/receipts", requireAuth, receiptsRouter);
    app.use("/api/flyers", requireAuth, flyersRouter);
    app.use("/api/admin", requireAuth, requireAdmin, adminRouter);
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;

    // The admin account exists before its email is listed (signup refuses a listed one).
    process.env.ADMIN_EMAILS = "";
    const admin = await member("placeholder-admin-source");
    await prisma.user.update({ where: { id: admin.id }, data: { email: adminEmail } });
    adminId = admin.id;
    adminCookie = admin.cookie;
    process.env.ADMIN_EMAILS = adminEmail;
  });

  afterAll(async () => {
    if (savedAdminEmails === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = savedAdminEmails;
    if (savedSettings) await prisma.appSettings.update({ where: { id: "app" }, data: { aiDailyLimit: savedSettings.aiDailyLimit } });
    else await prisma.appSettings.deleteMany({ where: { id: "app" } });
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    await prisma.inviteCode.deleteMany({ where: { id: { in: createdCodes } } });
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  });

  describe("signup", () => {
    it("is refused without a code, or with one that doesn't exist, and makes no account", async () => {
      const none = await signup(emailFor("nocode"), undefined);
      expect(none.status).toBe(403);
      expect(none.data.code).toBe("inviteRequired");
      expect(none.cookie).toBeUndefined();

      const blank = await signup(emailFor("nocode"), "   ");
      expect(blank.data.code).toBe("inviteRequired");

      const wrong = await signup(emailFor("nocode"), "ZZZZ-ZZZZ");
      expect(wrong.status).toBe(403);
      expect(wrong.data.code).toBe("inviteUnknown");

      expect(await prisma.user.findUnique({ where: { email: emailFor("nocode") } })).toBeNull();
    });

    it("says it in the language the app asks for", async () => {
      const en = await signup(emailFor("lang"), "ZZZZ-ZZZZ", { lang: "en" });
      expect(en.data.error).toBe("That invite code doesn't exist. Check it and try again.");
      const fr = await signup(emailFor("lang"), undefined, { lang: "fr" });
      expect(fr.data.error).toMatch(/code d'invitation/);
    });

    it("lets a valid code in, spends one use, and remembers which code the account used", async () => {
      const invite = await makeCode({ maxUses: 3 });
      const res = await signup(emailFor("welcome"), invite.code);
      expect(res.status).toBe(201);
      expect(res.cookie).toMatch(/^session=/);
      createdUsers.push(res.data.id);
      expect((await prisma.inviteCode.findUnique({ where: { id: invite.id } })).usedCount).toBe(1);
      expect((await prisma.user.findUnique({ where: { id: res.data.id } })).inviteCodeId).toBe(invite.id);
    });

    it("reads the code however it is typed", async () => {
      const invite = await makeCode({ maxUses: 3 });
      const typed = invite.code.toLowerCase().replace("-", " ");
      const res = await signup(emailFor("typed"), `  ${typed} `);
      expect(res.status).toBe(201);
      createdUsers.push(res.data.id);
    });

    it("refuses a used code, an expired one and a switched-off one, each with its own message", async () => {
      const single = await makeCode(); // single-use
      const first = await signup(emailFor("single-1"), single.code);
      expect(first.status).toBe(201);
      createdUsers.push(first.data.id);
      const second = await signup(emailFor("single-2"), single.code, { lang: "en" });
      expect(second.status).toBe(403);
      expect(second.data.code).toBe("inviteUsed");
      expect(second.data.error).toBe("That invite code has already been used. Ask for a new one.");

      const expired = await makeCode({ expiresAt: new Date(Date.now() - 60_000) });
      const late = await signup(emailFor("late"), expired.code, { lang: "en" });
      expect(late.status).toBe(403);
      expect(late.data.code).toBe("inviteExpired");

      const off = await makeCode({ active: false });
      const stopped = await signup(emailFor("stopped"), off.code, { lang: "fr" });
      expect(stopped.status).toBe(403);
      expect(stopped.data.code).toBe("inviteOff");
      expect(stopped.data.error).toBe("Ce code d'invitation a été désactivé. Demandez-en un nouveau.");

      for (const name of ["single-2", "late", "stopped"]) expect(await prisma.user.findUnique({ where: { email: emailFor(name) } })).toBeNull();
    });

    it("lets a limited-use code in as many times as it allows, then refuses", async () => {
      const invite = await makeCode({ maxUses: 2 });
      for (const name of ["multi-1", "multi-2"]) {
        const res = await signup(emailFor(name), invite.code);
        expect(res.status).toBe(201);
        createdUsers.push(res.data.id);
      }
      expect((await signup(emailFor("multi-3"), invite.code)).data.code).toBe("inviteUsed");
      expect((await prisma.inviteCode.findUnique({ where: { id: invite.id } })).usedCount).toBe(2);
    });

    it("gives the last use to only one of several signups at the same moment", async () => {
      const invite = await makeCode();
      const results = await Promise.all(["race-1", "race-2", "race-3", "race-4", "race-5"].map((name) => signup(emailFor(name), invite.code)));
      for (const res of results) if (res.status === 201) createdUsers.push(res.data.id);
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 403).every((r) => r.data.code === "inviteUsed")).toBe(true);
      expect((await prisma.inviteCode.findUnique({ where: { id: invite.id } })).usedCount).toBe(1);
    });

    it("keeps the code's use when the account can't be made", async () => {
      const taken = await member("taken");
      const invite = await makeCode();
      const res = await signup(taken.email, invite.code);
      expect(res.status).toBe(409);
      expect((await prisma.inviteCode.findUnique({ where: { id: invite.id } })).usedCount).toBe(0);
      const short = await call("/api/auth/signup", { method: "POST", body: { email: emailFor("short"), password: "short", inviteCode: invite.code } });
      expect(short.status).toBe(400);
      expect((await prisma.inviteCode.findUnique({ where: { id: invite.id } })).usedCount).toBe(0);
    });

    it("tells a visitor without a code nothing about which emails have an account", async () => {
      const taken = await member("known");
      const res = await signup(taken.email, undefined);
      expect(res.status).toBe(403);
      expect(res.data.code).toBe("inviteRequired");
    });

    it("leaves login alone: an existing account logs in without a code", async () => {
      const old = await member("old-timer");
      // An account from before invite codes has no code at all.
      await prisma.user.update({ where: { id: old.id }, data: { inviteCodeId: null } });
      const login = await call("/api/auth/login", { method: "POST", body: { email: old.email, password: "longenough1" } });
      expect(login.status).toBe(200);
      expect(login.data.email).toBe(old.email);
      expect((await call("/api/auth/me", { cookie: login.cookie })).status).toBe(200);
    });
  });

  describe("Admin: invite codes", () => {
    it("is for admins only, like the rest of /api/admin", async () => {
      const someone = await member("not-admin");
      expect((await call("/api/admin/invites", { cookie: someone.cookie })).status).toBe(403);
      expect((await call("/api/admin/invites", { method: "POST", cookie: someone.cookie, body: {} })).status).toBe(403);
      expect((await call("/api/admin/ai-usage", { cookie: someone.cookie })).status).toBe(403);
      expect((await call("/api/admin/ai-limit", { method: "PUT", cookie: someone.cookie, body: { limit: 999 } })).status).toBe(403);
      expect((await call("/api/admin/invites")).status).toBe(401);
    });

    it("creates a code with a note, uses and an expiry, lists it, and the code works for signup", async () => {
      const made = await call("/api/admin/invites", { method: "POST", cookie: adminCookie, body: { note: " for Emilie ", maxUses: 2, expiresInDays: 7 } });
      expect(made.status).toBe(201);
      createdCodes.push(made.data.id);
      expect(made.data).toMatchObject({ note: "for Emilie", maxUses: 2, usedCount: 0, active: true, state: "active", usedBy: [] });
      expect(made.data.code).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
      const days = (new Date(made.data.expiresAt) - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(6.99);
      expect(days).toBeLessThan(7.01);

      const emilie = await signup(emailFor("emilie"), made.data.code);
      expect(emilie.status).toBe(201);
      createdUsers.push(emilie.data.id);

      const list = await call("/api/admin/invites", { cookie: adminCookie });
      expect(list.status).toBe(200);
      const row = list.data.invites.find((i) => i.id === made.data.id);
      expect(row).toMatchObject({ code: made.data.code, note: "for Emilie", usedCount: 1, maxUses: 2, state: "active", usedBy: [emailFor("emilie")] });
    });

    it("makes a single-use code that never expires by default, and lists the newest first", async () => {
      const first = await call("/api/admin/invites", { method: "POST", cookie: adminCookie, body: {} });
      createdCodes.push(first.data.id);
      expect(first.data).toMatchObject({ note: null, maxUses: 1, expiresAt: null });
      const second = await call("/api/admin/invites", { method: "POST", cookie: adminCookie, body: { note: "second" } });
      createdCodes.push(second.data.id);
      const ids = (await call("/api/admin/invites", { cookie: adminCookie })).data.invites.map((i) => i.id);
      expect(ids.indexOf(second.data.id)).toBeLessThan(ids.indexOf(first.data.id));
    });

    it("refuses bad input with a message in the app's language", async () => {
      const bad = (body, lang) => call("/api/admin/invites", { method: "POST", cookie: adminCookie, body, lang });
      expect((await bad({ note: "x".repeat(81) }, "en")).data.error).toBe("The note can be at most 80 characters.");
      expect((await bad({ maxUses: 0 }, "en")).data.code).toBe("inviteBadUses");
      expect((await bad({ maxUses: 101 })).status).toBe(400);
      expect((await bad({ expiresInDays: 0 })).data.code).toBe("inviteBadExpiry");
      expect((await bad({ expiresInDays: 1.5 }, "fr")).data.error).toMatch(/jours/);
    });

    it("switches a code off, so signup refuses it, and back on", async () => {
      const made = await call("/api/admin/invites", { method: "POST", cookie: adminCookie, body: { maxUses: 3 } });
      createdCodes.push(made.data.id);

      const off = await call(`/api/admin/invites/${made.data.id}`, { method: "PATCH", cookie: adminCookie, body: { active: false } });
      expect(off.status).toBe(200);
      expect(off.data).toMatchObject({ active: false, state: "off" });
      expect((await signup(emailFor("off-try"), made.data.code)).data.code).toBe("inviteOff");

      const on = await call(`/api/admin/invites/${made.data.id}`, { method: "PATCH", cookie: adminCookie, body: { active: true } });
      expect(on.data).toMatchObject({ active: true, state: "active" });
      const res = await signup(emailFor("on-try"), made.data.code);
      expect(res.status).toBe(201);
      createdUsers.push(res.data.id);
    });

    it("switching a code off keeps the accounts that already used it", async () => {
      const made = await call("/api/admin/invites", { method: "POST", cookie: adminCookie, body: {} });
      createdCodes.push(made.data.id);
      const res = await signup(emailFor("stays"), made.data.code);
      createdUsers.push(res.data.id);
      await call(`/api/admin/invites/${made.data.id}`, { method: "PATCH", cookie: adminCookie, body: { active: false } });
      const login = await call("/api/auth/login", { method: "POST", body: { email: emailFor("stays"), password: "longenough1" } });
      expect(login.status).toBe(200);
    });

    it("answers 400 for a missing switch and 404 for a code that doesn't exist", async () => {
      expect((await call("/api/admin/invites/nope", { method: "PATCH", cookie: adminCookie, body: { active: false } })).status).toBe(404);
      const made = await call("/api/admin/invites", { method: "POST", cookie: adminCookie, body: {} });
      createdCodes.push(made.data.id);
      expect((await call(`/api/admin/invites/${made.data.id}`, { method: "PATCH", cookie: adminCookie, body: {} })).status).toBe(400);
      expect((await call(`/api/admin/invites/${made.data.id}`, { method: "PATCH", cookie: adminCookie, body: { active: "no" } })).status).toBe(400);
    });

    it("shows expired and used-up codes as such", async () => {
      const expired = await makeCode({ expiresAt: new Date(Date.now() - 1000) });
      const spent = await makeCode({ usedCount: 1 });
      const rows = (await call("/api/admin/invites", { cookie: adminCookie })).data.invites;
      expect(rows.find((i) => i.id === expired.id).state).toBe("expired");
      expect(rows.find((i) => i.id === spent.id).state).toBe("used");
    });
  });

  describe("the daily limit on Gemini readings", () => {
    const answer = { text: JSON.stringify({ items: [{ name: "milk" }], deals: [] }) };

    it("starts at the default of 10 when Matt never set one", async () => {
      await prisma.appSettings.deleteMany({ where: { id: "app" } });
      const usage = await call("/api/admin/ai-usage", { cookie: adminCookie });
      expect(usage.status).toBe(200);
      expect(usage.data).toMatchObject({ limit: 10, defaultLimit: 10, maxLimit: 1000, day: aiDay() });
    });

    it("lets an account read up to the limit, then refuses with the bilingual message, until the next day", async () => {
      await call("/api/admin/ai-limit", { method: "PUT", cookie: adminCookie, body: { limit: 2 } });
      const reader = await member("reader");
      gemini.generateContent = vi.fn().mockResolvedValue(answer);

      expect((await readReceipt(reader.cookie)).status).toBe(200);
      expect((await readReceipt(reader.cookie)).status).toBe(200);
      expect(gemini.generateContent).toHaveBeenCalledTimes(2);
      expect(await usedToday(reader.id)).toBe(2);

      // The flyer reading shares the same count.
      const flyer = await readFlyer(reader.cookie, "en");
      expect(flyer.status).toBe(429);
      expect(flyer.data).toEqual({
        error: "You've reached today's limit of 2 file readings (flyers and receipts). Try again tomorrow.",
        code: "aiLimit",
        limit: 2,
      });
      const receipt = await readReceipt(reader.cookie, "fr");
      expect(receipt.status).toBe(429);
      expect(receipt.data.error).toBe("Vous avez atteint la limite quotidienne de 2 lectures de fichiers (circulaires et reçus). Réessayez demain.");
      expect(gemini.generateContent).toHaveBeenCalledTimes(2); // refused before Gemini was called
      expect(await usedToday(reader.id)).toBe(2);

      // Tomorrow's count starts at zero.
      await prisma.aiUsage.update({ where: { userId_day: { userId: reader.id, day: aiDay() } }, data: { day: "2000-01-01" } });
      expect((await readReceipt(reader.cookie)).status).toBe(200);
    });

    it("counts each account on its own", async () => {
      await call("/api/admin/ai-limit", { method: "PUT", cookie: adminCookie, body: { limit: 1 } });
      const one = await member("count-one");
      const two = await member("count-two");
      gemini.generateContent = vi.fn().mockResolvedValue(answer);
      expect((await readReceipt(one.cookie)).status).toBe(200);
      expect((await readReceipt(one.cookie)).status).toBe(429);
      expect((await readReceipt(two.cookie)).status).toBe(200);
    });

    it("can't be got past by sending several readings at the same moment", async () => {
      await call("/api/admin/ai-limit", { method: "PUT", cookie: adminCookie, body: { limit: 3 } });
      const burst = await member("burst");
      gemini.generateContent = vi.fn().mockResolvedValue(answer);
      const results = await Promise.all(Array.from({ length: 8 }, () => readReceipt(burst.cookie)));
      expect(results.filter((r) => r.status === 200)).toHaveLength(3);
      expect(results.filter((r) => r.status === 429)).toHaveLength(5);
      expect(gemini.generateContent).toHaveBeenCalledTimes(3);
      expect(await usedToday(burst.id)).toBe(3);
    });

    it("applies the limit as it is now: lowering it stops an account that had used more", async () => {
      await call("/api/admin/ai-limit", { method: "PUT", cookie: adminCookie, body: { limit: 5 } });
      const who = await member("lowered");
      gemini.generateContent = vi.fn().mockResolvedValue(answer);
      for (let i = 0; i < 3; i++) expect((await readReceipt(who.cookie)).status).toBe(200);
      await call("/api/admin/ai-limit", { method: "PUT", cookie: adminCookie, body: { limit: 2 } });
      expect((await readReceipt(who.cookie)).status).toBe(429);
      await call("/api/admin/ai-limit", { method: "PUT", cookie: adminCookie, body: { limit: 4 } });
      expect((await readReceipt(who.cookie)).status).toBe(200);
    });

    it("pauses reading for everyone when the limit is 0", async () => {
      await call("/api/admin/ai-limit", { method: "PUT", cookie: adminCookie, body: { limit: 0 } });
      const who = await member("paused");
      gemini.generateContent = vi.fn().mockResolvedValue(answer);
      const res = await readReceipt(who.cookie, "en");
      expect(res.status).toBe(429);
      expect(res.data.code).toBe("aiPaused");
      expect(res.data.error).toBe("Reading flyers and receipts is paused for now. Try again later.");
      expect(gemini.generateContent).not.toHaveBeenCalled();
      expect(await usedToday(who.id)).toBe(0);
    });

    it("doesn't count a request that fails the file checks, or one Gemini couldn't answer", async () => {
      await call("/api/admin/ai-limit", { method: "PUT", cookie: adminCookie, body: { limit: 1 } });
      const who = await member("not-counted");
      gemini.generateContent = vi.fn();

      // No file / wrong file type: refused before the limit is touched.
      expect((await call("/api/receipts/parse", { method: "POST", cookie: who.cookie, form: new FormData() })).status).toBe(400);
      const text = new FormData();
      text.append("file", new Blob(["hi"], { type: "text/plain" }), "a.txt");
      expect((await call("/api/receipts/parse", { method: "POST", cookie: who.cookie, form: text })).status).toBe(400);
      expect(await usedToday(who.id)).toBe(0);

      // Gemini busy (429), down (503), key refused (403) or unreachable: given back.
      for (const failure of [new gemini.ApiError(429, "busy"), new gemini.ApiError(503, "down"), new gemini.ApiError(403, "key"), new TypeError("fetch failed")]) {
        gemini.generateContent = vi.fn().mockRejectedValue(failure);
        const res = await readFlyer(who.cookie);
        expect(res.data.code).not.toBe("aiLimit");
        expect(await usedToday(who.id)).toBe(0);
      }

      // Now a real reading still works.
      gemini.generateContent = vi.fn().mockResolvedValue(answer);
      expect((await readReceipt(who.cookie)).status).toBe(200);
    });

    it("counts a file Gemini rejected as unreadable (400), so failing requests can't go on for ever", async () => {
      await call("/api/admin/ai-limit", { method: "PUT", cookie: adminCookie, body: { limit: 1 } });
      const who = await member("rejected");
      gemini.generateContent = vi.fn().mockRejectedValue(new gemini.ApiError(400, "bad file"));
      expect((await readReceipt(who.cookie)).status).toBe(502);
      expect(await usedToday(who.id)).toBe(1);
      expect((await readReceipt(who.cookie)).status).toBe(429);
    });

    it("shows each account's use today in Admin, most used first, with only emails and counts", async () => {
      await call("/api/admin/ai-limit", { method: "PUT", cookie: adminCookie, body: { limit: 5 } });
      const heavy = await member("heavy");
      const light = await member("light");
      gemini.generateContent = vi.fn().mockResolvedValue(answer);
      for (let i = 0; i < 3; i++) await readReceipt(heavy.cookie);
      await readReceipt(light.cookie);

      const usage = await call("/api/admin/ai-usage", { cookie: adminCookie });
      expect(usage.status).toBe(200);
      const rows = usage.data.members;
      expect(rows.find((r) => r.email === heavy.email)).toEqual({ email: heavy.email, used: 3 });
      expect(rows.find((r) => r.email === light.email)).toEqual({ email: light.email, used: 1 });
      expect(rows.find((r) => r.email === adminEmail)).toEqual({ email: adminEmail, used: 0 });
      expect(rows.findIndex((r) => r.email === heavy.email)).toBeLessThan(rows.findIndex((r) => r.email === light.email));
      expect(usage.data.limit).toBe(5);
      for (const row of rows) expect(Object.keys(row).sort()).toEqual(["email", "used"]);
    });

    it("changes the limit only to a whole number from 0 to 1000", async () => {
      const put = (limit, lang) => call("/api/admin/ai-limit", { method: "PUT", cookie: adminCookie, body: { limit }, lang });
      expect((await put(25)).data).toEqual({ limit: 25 });
      expect((await call("/api/admin/ai-usage", { cookie: adminCookie })).data.limit).toBe(25);
      for (const bad of [-1, 1001, 2.5, "10", null]) expect((await put(bad)).status).toBe(400);
      expect((await put(-1, "en")).data.error).toBe("The daily limit must be a whole number from 0 to 1000.");
      expect((await put(-1, "fr")).data.error).toMatch(/nombre entier/);
      expect((await call("/api/admin/ai-usage", { cookie: adminCookie })).data.limit).toBe(25);
    });

    it("is the same limit for an admin", async () => {
      await call("/api/admin/ai-limit", { method: "PUT", cookie: adminCookie, body: { limit: 1 } });
      gemini.generateContent = vi.fn().mockResolvedValue(answer);
      expect((await readReceipt(adminCookie)).status).toBe(200);
      expect((await readReceipt(adminCookie)).status).toBe(429);
      expect(await usedToday(adminId)).toBe(1);
    });
  });
});

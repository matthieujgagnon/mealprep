import { execFile } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";
import express from "express";
import cookieParser from "cookie-parser";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Resend is never called: the mailer gets this stand-in, which answers (or
// fails) as each test says.
const resend = vi.hoisted(() => ({ send: null, sent: [] }));
vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (message) => {
        resend.sent.push(message);
        return resend.send(message);
      },
    };
  },
}));

const { prisma } = await import("./prisma.js");
const { requireAuth } = await import("./auth.js");
const { requireAdmin } = await import("./admin.js");
const { generateCode } = await import("./invites.js");
const { forgetEmailFailure } = await import("./mailer.js");
const { authRouter } = await import("../routes/auth.js");
const { adminRouter } = await import("../routes/admin.js");

// Password reset against the real database through the same mounting as
// server/src/index.js: the Reset link button in Admin, the "forgot password"
// page (with Resend replaced), and the `npm run reset-link` script. Skipped when
// no database is reachable.
let dbUp = true;
try {
  await prisma.$queryRaw`SELECT 1`;
} catch {
  dbUp = false;
}

const APP_URL = "https://cookbook.example.com";
const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/resetLink.js");
const ENV_KEYS = ["ADMIN_EMAILS", "APP_URL", "RESEND_API_KEY", "EMAIL_FROM", "RESET_EMAIL_FROM"];

describe.skipIf(!dbUp)("password reset", () => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const emailFor = (name) => `${name}-${stamp}@example.com`;
  const adminEmail = emailFor("reset-admin");
  const created = [];
  let server;
  let base;
  let invite;
  let saved;
  let admin;

  async function call(urlPath, { cookie, method = "GET", body, lang } = {}) {
    const res = await fetch(`${base}${urlPath}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(lang ? { "X-Lang": lang } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, cookie: res.headers.get("set-cookie")?.split(";")[0], data: await res.json().catch(() => null) };
  }

  // An account with a password, tracked for clean-up.
  async function member(name, extra = {}) {
    const email = emailFor(name);
    const res = await call("/api/auth/signup", { method: "POST", body: { email, password: "originalpass1", inviteCode: invite.code } });
    expect(res.status).toBe(201);
    created.push(res.data.id);
    if (Object.keys(extra).length) await prisma.user.update({ where: { id: res.data.id }, data: extra });
    return { id: res.data.id, email, cookie: res.cookie };
  }

  const login = (email, password) => call("/api/auth/login", { method: "POST", body: { email, password } });
  const resetWith = (token, password = "brandnewpass2", lang) =>
    call("/api/auth/reset-password", { method: "POST", body: { token, password }, lang });
  const adminLink = (id, cookie = admin.cookie) => call(`/api/admin/members/${id}/reset-link`, { method: "POST", cookie });
  const tokenOf = (url) => new URL(url).searchParams.get("token");
  const forgot = (email, lang) => call("/api/auth/forgot-password", { method: "POST", body: { email }, lang });
  const unusedTokens = (userId) => prisma.passwordResetToken.count({ where: { userId, usedAt: null } });
  const emailedToken = (message) => message.html.match(/token=([A-Za-z0-9]+)/)[1];

  beforeAll(async () => {
    saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    invite = await prisma.inviteCode.create({ data: { code: generateCode(), maxUses: 100 } });
    const app = express();
    app.set("trust proxy", 1);
    app.use(cookieParser());
    app.use(express.json());
    app.use("/api/auth", authRouter);
    app.use("/api/admin", requireAuth, requireAdmin, adminRouter);
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;

    // The admin account exists before its email is listed (signup refuses a listed one).
    process.env.ADMIN_EMAILS = "";
    admin = await member("reset-admin");
    process.env.ADMIN_EMAILS = adminEmail;
  });

  afterAll(async () => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    await prisma.user.deleteMany({ where: { id: { in: created } } });
    await prisma.inviteCode.delete({ where: { id: invite.id } });
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  });

  beforeEach(() => {
    process.env.APP_URL = APP_URL;
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "Matt Mo Cookbook <noreply@example.com>";
    delete process.env.RESET_EMAIL_FROM;
    resend.sent.length = 0;
    resend.send = async () => ({ data: { id: "email-1" }, error: null });
    forgetEmailFailure();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    forgetEmailFailure();
  });

  describe("Reset link in Admin", () => {
    it("makes a one-time link that expires in 1 hour, on the same reset page", async () => {
      const friend = await member("friend-link");
      const before = Date.now();
      const res = await adminLink(friend.id);
      expect(res.status).toBe(201);
      expect(Object.keys(res.data).sort()).toEqual(["expiresAt", "url"]);
      expect(res.data.url).toMatch(new RegExp(`^${APP_URL}/reset-password\\?token=[A-Za-z0-9]+$`));

      const row = await prisma.passwordResetToken.findUniqueOrThrow({ where: { id: tokenOf(res.data.url) } });
      expect(row.userId).toBe(friend.id);
      expect(row.usedAt).toBeNull();
      const lifetime = row.expiresAt.getTime() - before;
      expect(lifetime).toBeGreaterThan(59 * 60 * 1000);
      expect(lifetime).toBeLessThan(61 * 60 * 1000);
      expect(new Date(res.data.expiresAt).getTime()).toBe(row.expiresAt.getTime());
    });

    it("works with the id from the Members list", async () => {
      const friend = await member("friend-list");
      const list = await call("/api/admin/members", { cookie: admin.cookie });
      const row = list.data.members.find((m) => m.email === friend.email);
      expect(row.id).toBe(friend.id);
      expect((await adminLink(row.id)).status).toBe(201);
    });

    it("is for admins only: a member gets 403, a visitor 401, and no link is made", async () => {
      const friend = await member("friend-guard");
      const other = await member("other-guard");
      expect((await adminLink(friend.id, other.cookie)).status).toBe(403);
      expect((await adminLink(friend.id, null)).status).toBe(401);
      expect(await prisma.passwordResetToken.count({ where: { userId: friend.id } })).toBe(0);
    });

    it("answers 404 for a member that doesn't exist", async () => {
      const res = await call("/api/admin/members/not-a-real-id/reset-link", { method: "POST", cookie: admin.cookie });
      expect(res.status).toBe(404);
      expect(res.data.code).toBe("notFound.member");
    });

    it("works once, then the link is spent", async () => {
      const friend = await member("friend-once");
      const { data } = await adminLink(friend.id);
      const token = tokenOf(data.url);

      expect((await resetWith(token, "brandnewpass2")).status).toBe(200);
      expect((await login(friend.email, "brandnewpass2")).status).toBe(200);
      expect((await login(friend.email, "originalpass1")).status).toBe(401);

      const again = await resetWith(token, "sneakypass3");
      expect(again.status).toBe(400);
      expect(again.data.code).toBe("resetInvalid");
      expect((await login(friend.email, "brandnewpass2")).status).toBe(200);
    });

    it("signs the member out everywhere when the link is used", async () => {
      const friend = await member("friend-signout");
      const phone = (await login(friend.email, "originalpass1")).cookie;
      expect((await call("/api/auth/me", { cookie: friend.cookie })).status).toBe(200);
      expect((await call("/api/auth/me", { cookie: phone })).status).toBe(200);

      const { data } = await adminLink(friend.id);
      await resetWith(tokenOf(data.url));

      expect((await call("/api/auth/me", { cookie: friend.cookie })).status).toBe(401);
      expect((await call("/api/auth/me", { cookie: phone })).status).toBe(401);
    });

    it("stops working after 1 hour", async () => {
      const friend = await member("friend-expiry");
      const { data } = await adminLink(friend.id);
      const token = tokenOf(data.url);
      await prisma.passwordResetToken.update({ where: { id: token }, data: { expiresAt: new Date(Date.now() - 1000) } });

      const res = await resetWith(token);
      expect(res.status).toBe(400);
      expect(res.data.code).toBe("resetInvalid");
      expect((await login(friend.email, "originalpass1")).status).toBe(200);
    });

    it("replaces any earlier link the member hadn't used", async () => {
      const friend = await member("friend-replace");
      const first = tokenOf((await adminLink(friend.id)).data.url);
      const second = tokenOf((await adminLink(friend.id)).data.url);
      expect(second).not.toBe(first);
      expect(await unusedTokens(friend.id)).toBe(1);

      expect((await resetWith(first)).status).toBe(400);
      expect((await resetWith(second)).status).toBe(200);
    });

    it("uses the address the request came to when APP_URL isn't set", async () => {
      delete process.env.APP_URL;
      const friend = await member("friend-noappurl");
      const { data } = await adminLink(friend.id);
      expect(data.url).toBe(`${base}/reset-password?token=${tokenOf(data.url)}`);
    });
  });

  describe("Forgot password", () => {
    const calm = {
      en: "We can't send emails yet. Ask Matt for a reset link.",
      fr: "Nous ne pouvons pas encore envoyer de courriels. Demandez un lien de réinitialisation à Matt.",
    };

    describe("when email isn't set up", () => {
      it.each([
        ["no Resend key", () => delete process.env.RESEND_API_KEY],
        ["no sender address", () => delete process.env.EMAIL_FROM],
      ])("with %s: says so, the same for every email, and makes and sends nothing", async (_name, unset) => {
        unset();
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        const friend = await member(`friend-notsetup-${_name.split(" ")[1]}`);

        const known = await forgot(friend.email, "en");
        const unknown = await forgot(emailFor("nobody"), "en");
        expect(known.status).toBe(200);
        expect(known.data).toEqual({ sent: false, message: calm.en });
        expect(unknown.data).toEqual(known.data);
        expect(resend.sent).toEqual([]);
        expect(await prisma.passwordResetToken.count({ where: { userId: friend.id } })).toBe(0);
        expect(log).toHaveBeenCalledWith(expect.stringMatching(/isn't set up.*RESEND_API_KEY and EMAIL_FROM/));
      });

      it("answers in Quebec French when the app asks for French", async () => {
        delete process.env.EMAIL_FROM;
        vi.spyOn(console, "error").mockImplementation(() => {});
        const res = await forgot(emailFor("anyone"), "fr");
        expect(res.data).toEqual({ sent: false, message: calm.fr });
      });

      it("doesn't fall back to Resend's test address", async () => {
        delete process.env.EMAIL_FROM;
        vi.spyOn(console, "error").mockImplementation(() => {});
        const friend = await member("friend-nodefault");
        await forgot(friend.email, "en");
        expect(resend.sent).toEqual([]);
      });
    });

    describe("when email is set up", () => {
      it("emails a link that works once, from EMAIL_FROM, in English", async () => {
        const friend = await member("friend-en", { locale: "en" });
        // The page's answer is in the language the app asks for; the email is in the account's.
        const res = await forgot(friend.email, "fr");
        expect(res.data).toEqual({
          sent: true,
          message: "Si ce courriel a un compte, nous avons envoyé un lien pour réinitialiser le mot de passe.",
        });

        expect(resend.sent).toHaveLength(1);
        const [message] = resend.sent;
        expect(message.from).toBe("Matt Mo Cookbook <noreply@example.com>");
        expect(message.to).toBe(friend.email);
        expect(message.subject).toBe("Reset your password");
        expect(message.html).toContain(`href="${APP_URL}/reset-password?token=`);

        const token = emailedToken(message);
        expect((await resetWith(token)).status).toBe(200);
        expect((await resetWith(token)).status).toBe(400);
      });

      it("emails in French to an account whose language is French", async () => {
        const friend = await member("friend-fr", { locale: "fr" });
        await forgot(friend.email, "en");
        expect(resend.sent[0].subject).toBe("Réinitialisez votre mot de passe");
        expect(resend.sent[0].html).toContain("Ce lien ne fonctionne qu'une fois");
      });

      it("answers the same for an email with no account, and sends nothing", async () => {
        const friend = await member("friend-same");
        const known = await forgot(friend.email, "en");
        const unknown = await forgot(emailFor("nobody-same"), "en");
        expect(unknown.status).toBe(known.status);
        expect(unknown.data).toEqual(known.data);
        expect(resend.sent).toHaveLength(1);
      });

      it("doesn't send a second email for a repeat within 2 minutes, and still doesn't claim a new one", async () => {
        const friend = await member("friend-cooldown");
        await forgot(friend.email, "en");
        const again = await forgot(friend.email, "en");
        expect(again.data.sent).toBe(true);
        expect(resend.sent).toHaveLength(1);
        expect(await unusedTokens(friend.id)).toBe(1);
      });

      it("isn't held back by a link an admin made a moment ago", async () => {
        const friend = await member("friend-adminfirst");
        await adminLink(friend.id);
        const res = await forgot(friend.email, "en");
        expect(res.data.sent).toBe(true);
        expect(resend.sent).toHaveLength(1);
      });

      it("needs an email", async () => {
        const res = await call("/api/auth/forgot-password", { method: "POST", body: {} });
        expect(res.status).toBe(400);
      });
    });

    describe("when Resend refuses", () => {
      const testingMode = {
        message:
          "You can only send testing emails to your own email address (owner@example.com). To send emails to other recipients, please verify a domain at resend.com/domains.",
      };

      it("logs Resend's reason, never says 'sent', and leaves no link behind", async () => {
        resend.send = async () => ({ data: null, error: testingMode });
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        const friend = await member("friend-refused");

        const res = await forgot(friend.email, "en");
        expect(res.status).toBe(200);
        expect(res.data).toEqual({ sent: false, message: calm.en });
        expect(log).toHaveBeenCalledWith("Failed to send password reset email:", expect.stringContaining("You can only send testing emails"));
        expect(await prisma.passwordResetToken.count({ where: { userId: friend.id } })).toBe(0);

        // Tapping again doesn't turn into "sent" either.
        const again = await forgot(friend.email, "en");
        expect(again.data).toEqual({ sent: false, message: calm.en });
      });

      it("keeps a link an admin made, and answers everyone the same for a while without trying again", async () => {
        resend.send = async () => ({ data: null, error: testingMode });
        vi.spyOn(console, "error").mockImplementation(() => {});
        const friend = await member("friend-keep");
        const other = await member("friend-other");
        const adminMade = tokenOf((await adminLink(friend.id)).data.url);

        await forgot(friend.email, "en");
        expect(resend.sent).toHaveLength(1);
        expect(await unusedTokens(friend.id)).toBe(1);

        // For the next 10 minutes: the same answer for any email, and Resend isn't tried again.
        const known = await forgot(other.email, "fr");
        const unknown = await forgot(emailFor("nobody-refused"), "fr");
        expect(known.data).toEqual({ sent: false, message: calm.fr });
        expect(unknown.data).toEqual(known.data);
        expect(resend.sent).toHaveLength(1);

        // The admin's link still works.
        expect((await resetWith(adminMade)).status).toBe(200);
      });

      it("tries again once the 10 minutes are over", async () => {
        resend.send = async () => ({ data: null, error: testingMode });
        vi.spyOn(console, "error").mockImplementation(() => {});
        const friend = await member("friend-recover");
        await forgot(friend.email, "en");

        forgetEmailFailure(); // what 10 minutes does
        resend.send = async () => ({ data: { id: "email-2" }, error: null });
        const res = await forgot(friend.email, "en");
        expect(res.data.sent).toBe(true);
        expect(resend.sent).toHaveLength(2);
      });
    });
  });

  describe("npm run reset-link", () => {
    async function run(...args) {
      try {
        const { stdout, stderr } = await promisify(execFile)(process.execPath, [SCRIPT, ...args], {
          env: { ...process.env, APP_URL },
          timeout: 20_000,
        });
        return { code: 0, stdout, stderr };
      } catch (err) {
        return { code: err.code, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
      }
    }
    const linkIn = (stdout) => stdout.match(/https?:\/\/\S+\/reset-password\?token=[A-Za-z0-9]+/)?.[0];

    it("prints a one-time 1-hour link for an account, found however the email is typed", async () => {
      const friend = await member("friend-script");
      const out = await run(` ${friend.email.toUpperCase()} `);
      expect(out.code).toBe(0);
      const url = linkIn(out.stdout);
      expect(url).toMatch(new RegExp(`^${APP_URL}/reset-password\\?token=`));
      expect(out.stdout).toMatch(/works once, expires in 1 hour/);

      const row = await prisma.passwordResetToken.findUniqueOrThrow({ where: { id: tokenOf(url) } });
      expect(row.userId).toBe(friend.id);
      const lifetime = row.expiresAt.getTime() - Date.now();
      expect(lifetime).toBeGreaterThan(58 * 60 * 1000);
      expect(lifetime).toBeLessThanOrEqual(60 * 60 * 1000);

      expect((await resetWith(tokenOf(url))).status).toBe(200);
      expect((await resetWith(tokenOf(url))).status).toBe(400);
    });

    it("uses the same rules as the Admin button: it replaces a link not yet used", async () => {
      const friend = await member("friend-script-replace");
      const fromAdmin = tokenOf((await adminLink(friend.id)).data.url);
      const out = await run(friend.email);
      expect(linkIn(out.stdout)).toBeTruthy();
      expect(await unusedTokens(friend.id)).toBe(1);
      expect((await resetWith(fromAdmin)).status).toBe(400);
    });

    it("logs that it was used on one line, without the link in it", async () => {
      const friend = await member("friend-script-log");
      const out = await run(friend.email);
      const logLine = out.stdout.split("\n").find((line) => line.startsWith("[reset-link]"));
      expect(logLine).toMatch(new RegExp(`^\\[reset-link\\] \\d{4}-\\d\\d-\\d\\dT[\\d:.]+Z used for ${friend.email}: reset link made\\.$`));
      expect(logLine).not.toContain("token=");
    });

    it("says only 'No such account.' for an email with no account, and makes nothing", async () => {
      const typed = emailFor("ghost");
      const before = await prisma.passwordResetToken.count();
      const out = await run(typed);
      expect(out.code).toBe(1);
      expect(out.stderr).toBe("");
      expect(out.stdout.trim().split("\n")).toHaveLength(1);
      expect(out.stdout).toMatch(new RegExp(`^\\[reset-link\\] \\S+ used for ${typed}: No such account\\.\\n$`));
      expect(out.stdout).not.toContain("reset-password");
      expect(await prisma.passwordResetToken.count()).toBe(before);
    });

    it("shows how to use it when no email is given", async () => {
      const out = await run();
      expect(out.code).toBe(1);
      expect(out.stderr).toContain("Usage: npm run reset-link -- someone@example.com");
    });
  });
});

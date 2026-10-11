import express from "express";
import cookieParser from "cookie-parser";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";
import { requireAuth } from "./auth.js";
import { requireAdmin } from "./admin.js";
import { generateCode } from "./invites.js";
import { authRouter } from "../routes/auth.js";
import { adminRouter } from "../routes/admin.js";

// The admin guard and the signup rule against the real database, through
// the same mounting as server/src/index.js. Skipped when no database is
// reachable.
let dbUp = true;
try {
  await prisma.$queryRaw`SELECT 1`;
} catch {
  dbUp = false;
}

describe.skipIf(!dbUp)("/api/admin", () => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const adminEmail = `admin-${stamp}@example.com`;
  const memberEmail = `member-${stamp}@example.com`;
  const ghostEmail = `ghost-${stamp}@example.com`;
  let server;
  let base;
  let savedAdminEmails;
  let invite; // signup needs a code: one that lets every test account in
  const created = [];

  async function call(path, { cookie, method = "GET", body } = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, cookie: res.headers.get("set-cookie")?.split(";")[0], data: await res.json().catch(() => null) };
  }

  async function account(email, extra = {}) {
    const res = await call("/api/auth/signup", { method: "POST", body: { email, password: "longenough1", inviteCode: invite.code } });
    expect(res.status).toBe(201);
    const user = await prisma.user.update({ where: { email }, data: extra });
    created.push(user.id);
    return res.cookie;
  }

  beforeAll(async () => {
    savedAdminEmails = process.env.ADMIN_EMAILS;
    invite = await prisma.inviteCode.create({ data: { code: generateCode(), maxUses: 10 } });
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use("/api/auth", authRouter);
    app.use("/api/admin", requireAuth, requireAdmin, adminRouter);
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    process.env.ADMIN_EMAILS = savedAdminEmails ?? "";
    if (savedAdminEmails === undefined) delete process.env.ADMIN_EMAILS;
    await prisma.user.deleteMany({ where: { id: { in: created } } });
    await prisma.inviteCode.delete({ where: { id: invite.id } });
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  });

  it("lets a listed admin in, refuses a member with 403 and a visitor with 401", async () => {
    // Both accounts exist before the admin email is listed.
    process.env.ADMIN_EMAILS = "";
    const adminCookie = await account(adminEmail);
    const memberCookie = await account(memberEmail, { role: "admin" }); // a stored role alone grants nothing
    process.env.ADMIN_EMAILS = ` ${adminEmail.toUpperCase()} , ${ghostEmail}`;

    const asAdmin = await call("/api/admin/members", { cookie: adminCookie });
    expect(asAdmin.status).toBe(200);
    const row = asAdmin.data.members.find((m) => m.email === adminEmail);
    expect(Object.keys(row).sort()).toEqual(["email", "lastActiveAt", "signedUpAt"]);

    expect((await call("/api/admin/members", { cookie: memberCookie })).status).toBe(403);
    expect((await call("/api/admin/anything-else", { cookie: memberCookie })).status).toBe(403);
    expect((await call("/api/admin/members")).status).toBe(401);

    // The role column follows ADMIN_EMAILS.
    expect((await prisma.user.findUnique({ where: { email: adminEmail } })).role).toBe("admin");
    expect((await prisma.user.findUnique({ where: { email: memberEmail } })).role).toBe("member");

    const me = await call("/api/auth/me", { cookie: adminCookie });
    expect(me.data.isAdmin).toBe(true);
    // Using the app records "last active" (without holding up the request).
    await expect
      .poll(async () => (await prisma.user.findUnique({ where: { email: adminEmail } })).lastActiveAt)
      .toBeInstanceOf(Date);
    expect((await call("/api/auth/me", { cookie: memberCookie })).data.isAdmin).toBe(false);

    // Taken off the list: refused at once.
    process.env.ADMIN_EMAILS = ghostEmail;
    expect((await call("/api/admin/members", { cookie: adminCookie })).status).toBe(403);
  });

  it("refuses to sign up a listed email that has no account, like a taken email", async () => {
    process.env.ADMIN_EMAILS = ghostEmail;
    const res = await call("/api/auth/signup", { method: "POST", body: { email: `  ${ghostEmail.toUpperCase()} `, password: "longenough1", inviteCode: invite.code } });
    expect(res.status).toBe(409);
    expect(res.cookie).toBeUndefined();
    expect(await prisma.user.findUnique({ where: { email: ghostEmail } })).toBeNull();
  });
});

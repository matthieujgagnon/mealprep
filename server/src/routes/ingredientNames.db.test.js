import express from "express";
import cookieParser from "cookie-parser";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";
import { requireAdmin } from "../lib/admin.js";
import { generateCode } from "../lib/invites.js";
import { builtInIngredientRows } from "../lib/ingredientNames.js";
import { authRouter } from "./auth.js";
import { adminRouter } from "./admin.js";
import { ingredientNamesRouter } from "./ingredientNames.js";

// Matt's changes to the ingredient names table against the real database, through the same
// mounting as server/src/index.js. Skipped when no database is reachable. The table is shared
// by every account, so this test only touches rows it made (and built-in rows nothing has
// changed yet) and takes them all away at the end.
let dbUp = true;
try {
  await prisma.$queryRaw`SELECT 1`;
} catch {
  dbUp = false;
}

describe.skipIf(!dbUp)("/api/ingredient-names and /api/admin/ingredient-names", () => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const adminEmail = `names-admin-${stamp}@example.com`;
  const memberEmail = `names-member-${stamp}@example.com`;
  let server;
  let base;
  let savedAdminEmails;
  let invite;
  let admin;
  let member;
  const accounts = [];
  const madeIds = [];

  async function call(path, { cookie, method = "GET", body, lang = "en" } = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json", "X-Lang": lang, ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, cookie: res.headers.get("set-cookie")?.split(";")[0], data: await res.json().catch(() => null) };
  }

  async function account(email) {
    const res = await call("/api/auth/signup", { method: "POST", body: { email, password: "longenough1", inviteCode: invite.code } });
    expect(res.status).toBe(201);
    accounts.push((await prisma.user.findUnique({ where: { email } })).id);
    return res.cookie;
  }

  // Built-in rows nothing has replaced yet, so a test never touches a change Matt made.
  let free;
  async function freeKeys() {
    const taken = new Set((await prisma.ingredientNameOverride.findMany({ select: { replaces: true } })).map((r) => r.replaces));
    return builtInIngredientRows().filter((row) => !taken.has(row.key));
  }
  // Every call has names of its own, so a row made by one test never clashes with another's.
  let count = 0;
  const names = (extra) => {
    count++;
    return { enOne: `zq${stamp} one ${count}`, enOther: "", frOne: `zq${stamp} un ${count}`, frOther: "", gender: "m", ...extra };
  };
  const made = (res) => {
    if (res.data?.id) madeIds.push(res.data.id);
    return res;
  };

  beforeAll(async () => {
    savedAdminEmails = process.env.ADMIN_EMAILS;
    invite = await prisma.inviteCode.create({ data: { code: generateCode(), maxUses: 10 } });
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use("/api/auth", authRouter);
    app.use("/api/ingredient-names", requireAuth, ingredientNamesRouter);
    app.use("/api/admin", requireAuth, requireAdmin, adminRouter);
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
    process.env.ADMIN_EMAILS = "";
    admin = await account(adminEmail);
    member = await account(memberEmail);
    process.env.ADMIN_EMAILS = adminEmail;
    free = await freeKeys();
  });

  afterAll(async () => {
    process.env.ADMIN_EMAILS = savedAdminEmails ?? "";
    if (savedAdminEmails === undefined) delete process.env.ADMIN_EMAILS;
    await prisma.ingredientNameOverride.deleteMany({ where: { id: { in: madeIds } } });
    await prisma.user.deleteMany({ where: { id: { in: accounts } } });
    await prisma.inviteCode.delete({ where: { id: invite.id } });
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  });

  it("refuses a non-admin on save, change and remove with 403, and a visitor with 401, and changes nothing", async () => {
    const before = await prisma.ingredientNameOverride.count();
    expect((await call("/api/admin/ingredient-names", { cookie: member, method: "POST", body: names() })).status).toBe(403);
    expect((await call("/api/admin/ingredient-names/anything", { cookie: member, method: "PUT", body: names() })).status).toBe(403);
    expect((await call("/api/admin/ingredient-names/anything", { cookie: member, method: "DELETE" })).status).toBe(403);
    expect((await call("/api/admin/ingredient-names", { method: "POST", body: names() })).status).toBe(401);
    expect(await prisma.ingredientNameOverride.count()).toBe(before);
    // and not as someone who is in the table's author column but no longer listed
    const row = made(await call("/api/admin/ingredient-names", { cookie: admin, method: "POST", body: names() }));
    expect(row.status).toBe(201);
    expect((await call(`/api/admin/ingredient-names/${row.data.id}`, { cookie: member, method: "DELETE" })).status).toBe(403);
    expect(await prisma.ingredientNameOverride.findUnique({ where: { id: row.data.id } })).not.toBeNull();
  });

  it("adds an ingredient, and every account reads it (only an admin sees who saved it)", async () => {
    const res = made(await call("/api/admin/ingredient-names", { cookie: admin, method: "POST", body: names({ enOne: ` zq${stamp}  add `, frOne: `zq${stamp} ajout`, enOther: `zq${stamp} adds` }) }));
    expect(res.status).toBe(201);
    expect(res.data).toMatchObject({ replaces: null, hidden: false, enOne: `zq${stamp} add`, enOther: `zq${stamp} adds`, frOne: `zq${stamp} ajout`, frOther: "=", gender: "m", updatedBy: adminEmail });

    const asMember = await call("/api/ingredient-names", { cookie: member });
    expect(asMember.status).toBe(200);
    const mine = asMember.data.find((row) => row.id === res.data.id);
    expect(mine).toMatchObject({ enOne: `zq${stamp} add`, frOne: `zq${stamp} ajout` });
    expect("updatedBy" in mine).toBe(false);
    const asAdmin = await call("/api/ingredient-names", { cookie: admin });
    expect(asAdmin.data.find((row) => row.id === res.data.id).updatedBy).toBe(adminEmail);
    expect((await call("/api/ingredient-names")).status).toBe(401);
  });

  it("refuses a name that is empty, has no gender, is too long or has a |, in the language asked for", async () => {
    const post = (body, lang = "en") => call("/api/admin/ingredient-names", { cookie: admin, method: "POST", body, lang });
    expect((await post(names({ enOne: "" }))).data.error).toBe("Each name needs a singular in English and a singular in French.");
    expect((await post(names({ frOne: "" }), "fr")).data.error).toBe("Chaque nom a besoin d'un singulier en anglais et d'un singulier en français.");
    expect((await post(names({ gender: "" }))).status).toBe(400);
    expect((await post(names({ enOne: "x".repeat(61) }))).data.error).toBe("A name can be at most 60 characters.");
    expect((await post(names({ frOne: "a|b" }))).status).toBe(400);
    expect((await post({})).status).toBe(400);
  });

  it("refuses a spelling the built-in table already has, with the same message as for another change", async () => {
    const post = (body, lang = "en") => call("/api/admin/ingredient-names", { cookie: admin, method: "POST", body, lang });
    const english = await post(names({ enOne: "Garlic" }));
    expect(english.status).toBe(400);
    expect(english.data.error).toBe('"Garlic" is already used for another ingredient (garlic).');
    const french = await post(names({ frOne: "gousse d’ail" }), "fr");
    expect(french.status).toBe(400);
    expect(french.data.error).toBe("« gousse d’ail » est déjà utilisé pour un autre ingrédient (garlic clove).");
    expect((await post(names({ enOther: "red onions/tomatoes" }))).status).toBe(400);

    const first = made(await post(names({ enOne: `zq${stamp} dup`, frOne: `zq${stamp} doublon` })));
    expect(first.status).toBe(201);
    const again = await post(names({ frOne: `Zq${stamp}  Doublon` }), "fr");
    expect(again.status).toBe(400);
    expect(again.data.error).toBe(`« Zq${stamp} Doublon » est déjà utilisé pour un autre ingrédient (zq${stamp} dup).`);
    expect((await post(names({ enOne: `ZQ${stamp} DUP` }))).data.error).toBe(`"ZQ${stamp} DUP" is already used for another ingredient (zq${stamp} dup).`);
    // a spelling that is the other language's word is not a clash
    const other = made(await post(names({ enOne: `zq${stamp} other`, frOne: "garlic" })));
    expect(other.status).toBe(201);
  });

  it("replaces a built-in row once, whoever taps twice, and lets it keep its own spellings", async () => {
    const row = free[0];
    const body = { replaces: row.key, enOne: row.en.one[0], enOther: row.en.other[0], frOne: `zq${stamp} remplace`, frOther: "=", gender: "f" };
    const first = made(await call("/api/admin/ingredient-names", { cookie: admin, method: "POST", body }));
    expect(first.status).toBe(201);
    expect(first.data.replaces).toBe(row.key);
    const second = await call("/api/admin/ingredient-names", { cookie: admin, method: "POST", body: { ...body, gender: "m" } });
    expect(second.status).toBe(200);
    expect(second.data.id).toBe(first.data.id);
    expect(second.data.gender).toBe("m");
    expect(await prisma.ingredientNameOverride.count({ where: { replaces: row.key } })).toBe(1);
  });

  it("hides a built-in row, but not a row that isn't there, and not an ingredient that was added", async () => {
    const row = free[1];
    const hidden = made(await call("/api/admin/ingredient-names", { cookie: admin, method: "POST", body: { replaces: row.key, hidden: true, enOne: "ignored" } }));
    expect(hidden.status).toBe(201);
    expect(hidden.data).toMatchObject({ replaces: row.key, hidden: true, enOne: "", frOne: "", gender: "" });
    expect((await call("/api/admin/ingredient-names", { cookie: admin, method: "POST", body: { hidden: true } })).status).toBe(400);
    const missing = await call("/api/admin/ingredient-names", { cookie: admin, method: "POST", body: { replaces: "no such thing", hidden: true } });
    expect(missing.status).toBe(404);
    const added = made(await call("/api/admin/ingredient-names", { cookie: admin, method: "POST", body: names({ enOne: `zq${stamp} stays`, frOne: `zq${stamp} reste` }) }));
    expect((await call(`/api/admin/ingredient-names/${added.data.id}`, { cookie: admin, method: "PUT", body: { hidden: true } })).status).toBe(400);
    // with the row hidden, its spellings are free for a new ingredient
    const reuse = made(await call("/api/admin/ingredient-names", { cookie: admin, method: "POST", body: names({ enOne: row.en.one[0], frOne: `zq${stamp} libre` }) }));
    expect(reuse.status).toBe(201);
  });

  it("changes one, keeping the built-in row it stands in for, and says 404 for one that is gone", async () => {
    const row = free[2];
    const made1 = made(await call("/api/admin/ingredient-names", { cookie: admin, method: "POST", body: { replaces: row.key, enOne: row.en.one[0], enOther: "=", frOne: `zq${stamp} avant`, frOther: "=", gender: "m" } }));
    const put = await call(`/api/admin/ingredient-names/${made1.data.id}`, { cookie: admin, method: "PUT", body: { replaces: free[3].key, enOne: row.en.one[0], enOther: "=", frOne: `zq${stamp} après`, frOther: "=", gender: "f" } });
    expect(put.status).toBe(200);
    expect(put.data).toMatchObject({ replaces: row.key, frOne: `zq${stamp} après`, gender: "f" });
    expect((await call(`/api/admin/ingredient-names/${made1.data.id}`, { cookie: admin, method: "PUT", body: { ...names(), enOne: "Garlic" } })).status).toBe(400);
    expect((await call("/api/admin/ingredient-names/nope", { cookie: admin, method: "PUT", body: names() })).status).toBe(404);
  });

  it("removes one: the built-in row is free again, and a second remove says 404", async () => {
    const row = free[4];
    const made1 = made(await call("/api/admin/ingredient-names", { cookie: admin, method: "POST", body: { replaces: row.key, enOne: row.en.one[0], enOther: "=", frOne: `zq${stamp} jetable`, frOther: "=", gender: "m" } }));
    const gone = await call(`/api/admin/ingredient-names/${made1.data.id}`, { cookie: admin, method: "DELETE" });
    expect(gone.status).toBe(204);
    expect(await prisma.ingredientNameOverride.findUnique({ where: { id: made1.data.id } })).toBeNull();
    expect((await call(`/api/admin/ingredient-names/${made1.data.id}`, { cookie: admin, method: "DELETE" })).status).toBe(404);
    // the built-in row can be changed again
    const again = made(await call("/api/admin/ingredient-names", { cookie: admin, method: "POST", body: { replaces: row.key, enOne: row.en.one[0], enOther: "=", frOne: `zq${stamp} neuf`, frOther: "=", gender: "m" } }));
    expect(again.status).toBe(201);
  });

  it("keeps the row and forgets who saved it when that account goes", async () => {
    const res = made(await call("/api/admin/ingredient-names", { cookie: admin, method: "POST", body: names({ enOne: `zq${stamp} orphan`, frOne: `zq${stamp} orphelin` }) }));
    const temp = await prisma.user.create({ data: { email: `names-temp-${stamp}@example.com`, passwordHash: "x" } });
    await prisma.ingredientNameOverride.update({ where: { id: res.data.id }, data: { updatedById: temp.id } });
    await prisma.user.delete({ where: { id: temp.id } });
    const row = await prisma.ingredientNameOverride.findUnique({ where: { id: res.data.id } });
    expect(row.updatedById).toBeNull();
    const list = await call("/api/ingredient-names", { cookie: admin });
    expect(list.data.find((r) => r.id === res.data.id).updatedBy).toBeNull();
  });
});

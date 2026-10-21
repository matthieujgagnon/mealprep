import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const { prisma } = await import("../lib/prisma.js");
const { recipesRouter } = await import("./recipes.js");

// A recipe is several meal types at once and can be « Plat préparé », against the real database:
// the list and the flag are saved and read back, the old single column follows the first type,
// nothing saves a recipe with no type, the suggestions are only suggestions, and the migration
// that added the two columns keeps every recipe's type and deletes nothing. Skipped when no
// database is reachable.
let dbUp = true;
try {
  await prisma.$queryRaw`SELECT 1`;
} catch {
  dbUp = false;
}

describe.skipIf(!dbUp)("recipe meal types and the prepared flag (database)", () => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  let server;
  let base;
  let userId;

  async function call(url, { method = "GET", body } = {}) {
    const res = await fetch(`${base}${url}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json().catch(() => null) };
  }
  const create = (extra = {}) => call("/api/recipes", { method: "POST", body: { title: `Dish ${Math.random()}`, ingredients: [{ name: "rice" }], ...extra } });
  const row = (id) => prisma.recipe.findUnique({ where: { id } });

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `meal-types-${stamp}@example.com`, passwordHash: "x" } });
    userId = user.id;
    const app = express();
    app.use(express.json());
    app.use("/api/recipes", (req, _res, next) => {
      req.userId = userId;
      next();
    }, recipesRouter);
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("saves a list of meal types, in the usual order, and the old column follows the first", async () => {
    const made = await create({ title: "Chow Mein", mealSlots: ["dinner", "lunch"] });
    expect(made.status).toBe(201);
    expect(made.data.mealSlots).toEqual(["lunch", "dinner"]);
    expect(made.data.isPrepared).toBe(false);
    expect(await row(made.data.id)).toMatchObject({ mealSlots: ["lunch", "dinner"], mealSlot: "lunch", isPrepared: false });
    // Read back from the list route too.
    const listed = (await call("/api/recipes")).data.find((r) => r.id === made.data.id);
    expect(listed.mealSlots).toEqual(["lunch", "dinner"]);
  });

  it("still takes the one old type, and a recipe with no type yet is allowed (it waits for the sort screen)", async () => {
    const old = await create({ mealSlot: "breakfast" });
    expect(old.data).toMatchObject({ mealSlots: ["breakfast"], mealSlot: "breakfast" });
    const none = await create();
    expect(none.status).toBe(201);
    expect(none.data.mealSlots).toEqual([]);
    expect(await row(none.data.id)).toMatchObject({ mealSlots: [], mealSlot: null });
  });

  it("edits the list and the flag; a request that does not mention them leaves them alone", async () => {
    const made = await create({ title: "Croissants", mealSlots: ["breakfast"] });
    const id = made.data.id;
    const put = await call(`/api/recipes/${id}`, { method: "PUT", body: { mealSlots: ["breakfast", "snack"], isPrepared: true } });
    expect(put.status).toBe(200);
    expect(put.data).toMatchObject({ mealSlots: ["breakfast", "snack"], isPrepared: true });
    expect(await row(id)).toMatchObject({ mealSlots: ["breakfast", "snack"], mealSlot: "breakfast", isPrepared: true });

    await call(`/api/recipes/${id}`, { method: "PUT", body: { title: "Croissants au beurre" } });
    expect(await row(id)).toMatchObject({ title: "Croissants au beurre", mealSlots: ["breakfast", "snack"], isPrepared: true });
    await call(`/api/recipes/${id}`, { method: "PUT", body: { isPrepared: false, mealSlots: ["snack"] } });
    expect(await row(id)).toMatchObject({ mealSlots: ["snack"], mealSlot: "snack", isPrepared: false });
  });

  it("never saves a recipe with no type, an unknown type or a flag that is not a yes or no", async () => {
    const made = await create({ mealSlots: ["dinner"] });
    const id = made.data.id;
    for (const body of [{ mealSlots: [] }, { mealSlots: ["supper"] }, { mealSlots: "dinner" }, { mealSlot: "brunch" }, { isPrepared: "yes" }]) {
      const put = await call(`/api/recipes/${id}`, { method: "PUT", body });
      expect([JSON.stringify(body), put.status]).toEqual([JSON.stringify(body), 400]);
    }
    expect((await create({ mealSlots: [] })).status).toBe(400);
    expect(await row(id)).toMatchObject({ mealSlots: ["dinner"], mealSlot: "dinner", isPrepared: false });
    // The message is in the reader's language.
    const fr = await fetch(`${base}/api/recipes/${id}`, { method: "PUT", headers: { "Content-Type": "application/json", "X-Lang": "fr" }, body: JSON.stringify({ mealSlots: [] }) });
    expect((await fr.json()).error).toMatch(/au moins un type de repas/);
  });

  it("only suggests: the suggestions change nothing", async () => {
    const made = await create({ title: "Croissants", ingredients: [{ name: "croissants" }] });
    const before = await row(made.data.id);
    const { status, data } = await call("/api/recipes/suggest-types", {
      method: "POST",
      body: { recipes: [{ id: made.data.id, title: "Croissants", ingredients: [{ name: "croissants" }] }, { id: "x", title: "Matt's thing", ingredients: [{ name: "mystery" }, { name: "other" }] }] },
    });
    expect(status).toBe(200);
    expect(data.suggestions).toEqual([
      { id: made.data.id, slots: ["breakfast"], prepared: true },
      { id: "x", slots: [], prepared: false },
    ]);
    expect(await row(made.data.id)).toEqual(before);
    expect((await call("/api/recipes/suggest-types", { method: "POST", body: {} })).status).toBe(400);
  });

  it("the migration keeps every recipe's type as a list of one, gives the others an empty list, and deletes nothing", async () => {
    const sql = fs
      .readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../prisma/migrations/20261021090000_recipe_meal_types/migration.sql"), "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(sql).not.toMatch(/\b(DELETE|DROP|TRUNCATE)\b/i);
    expect(sql).not.toMatch(/\bRENAME\b/i);
    const steps = sql.split(";").map((s) => s.trim()).filter(Boolean);
    expect(steps).toHaveLength(3);
    expect(steps.filter((s) => /^ALTER TABLE "Recipe" ADD COLUMN/i.test(s))).toHaveLength(2);
    const backfill = steps.find((s) => /^UPDATE/i.test(s));

    // Recipes as they were before the columns: a type in the old column only.
    const mk = (title, mealSlot) => prisma.recipe.create({ data: { userId, title, instructions: "[]", mealSlot, mealSlots: [] } });
    const typed = await mk("Old supper", "dinner");
    const empty = await mk("Old none", null);
    const blank = await mk("Old blank", "");
    const tagged = await prisma.recipe.create({ data: { userId, title: "Old tagged", instructions: "[]", tags: JSON.stringify(["dessert"]) } });
    const total = await prisma.recipe.count({ where: { userId } });

    await prisma.$executeRawUnsafe(backfill);

    expect(await prisma.recipe.count({ where: { userId } })).toBe(total); // nothing deleted
    expect(await row(typed.id)).toMatchObject({ mealSlots: ["dinner"], mealSlot: "dinner", isPrepared: false });
    expect(await row(empty.id)).toMatchObject({ mealSlots: [], mealSlot: null });
    expect(await row(blank.id)).toMatchObject({ mealSlots: [], mealSlot: "" });
    expect((await row(tagged.id)).mealSlots).toEqual([]); // the app still reads its old tag
  });
});

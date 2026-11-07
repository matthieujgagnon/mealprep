import express from "express";
import cookieParser from "cookie-parser";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const { prisma } = await import("./prisma.js");
const { requireAuth } = await import("./auth.js");
const { generateCode } = await import("./invites.js");
const { addDays, quebecDay } = await import("./quebecDay.js");
const { mondayKey } = await import("./plannedDates.js");
const { undoRemoval, UNDO_KEEP_MS } = await import("./examples.js");
const { EXAMPLE_ITEMS, EXAMPLE_PLAN, EXAMPLE_RECIPES } = await import("./exampleContent.js");
const { authRouter } = await import("../routes/auth.js");
const { recipesRouter } = await import("../routes/recipes.js");
const { plannerRouter } = await import("../routes/planner.js");
const { pantryInventoryRouter } = await import("../routes/pantryInventory.js");
const { examplesRouter } = await import("../routes/examples.js");

// Examples: what a new account starts with, « Retirer les exemples », Undo, and « Ajouter des
// exemples », against the real database through the same mounting as server/src/index.js. Skipped
// when no database is reachable.
let dbUp = true;
try {
  await prisma.$queryRaw`SELECT 1`;
} catch {
  dbUp = false;
}

describe.skipIf(!dbUp)("examples", () => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  let server;
  let base;
  const createdUsers = [];
  const createdCodes = [];
  let savedSwitch;

  async function call(path, { cookie, method = "GET", body, lang } = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(lang ? { "X-Lang": lang } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, cookie: res.headers.get("set-cookie")?.split(";")[0], data: await res.json().catch(() => null) };
  }

  // A new account, signed up the real way (with a code of its own), tracked for clean-up.
  async function member(name, { locale = "fr" } = {}) {
    const invite = await prisma.inviteCode.create({ data: { code: generateCode(), maxUses: 5 } });
    createdCodes.push(invite.id);
    const email = `${name}-${stamp}@example.com`;
    const res = await call("/api/auth/signup", { method: "POST", body: { email, password: "longenough1", inviteCode: invite.code, locale } });
    expect(res.status).toBe(201);
    createdUsers.push(res.data.id);
    return { cookie: res.cookie, id: res.data.id };
  }

  const marked = (userId) => ({ userId, isExample: true });
  async function tally(userId) {
    const [recipes, entries, items] = await Promise.all([
      prisma.recipe.count({ where: marked(userId) }),
      prisma.plannerEntry.count({ where: marked(userId) }),
      prisma.pantryInventoryItem.count({ where: marked(userId) }),
    ]);
    return { recipes, plannedMeals: entries, inventoryItems: items };
  }
  const FULL = { recipes: 8, plannedMeals: 6, inventoryItems: 12 };

  beforeAll(async () => {
    savedSwitch = process.env.NEW_ACCOUNT_EXAMPLES;
    delete process.env.NEW_ACCOUNT_EXAMPLES;
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use("/api/auth", authRouter);
    app.use("/api/recipes", requireAuth, recipesRouter);
    app.use("/api/planner", requireAuth, plannerRouter);
    app.use("/api/pantry-inventory", requireAuth, pantryInventoryRouter);
    app.use("/api/examples", requireAuth, examplesRouter);
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.NEW_ACCOUNT_EXAMPLES;
  });

  afterAll(async () => {
    if (savedSwitch === undefined) delete process.env.NEW_ACCOUNT_EXAMPLES;
    else process.env.NEW_ACCOUNT_EXAMPLES = savedSwitch;
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    await prisma.inviteCode.deleteMany({ where: { id: { in: createdCodes } } });
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  });

  describe("signup", () => {
    it("starts the account with the examples, all marked, in the account's language", async () => {
      const fr = await member("fr", { locale: "fr" });
      expect(await tally(fr.id)).toEqual(FULL);
      const recipes = await prisma.recipe.findMany({ where: marked(fr.id), include: { ingredients: true } });
      expect(recipes.map((r) => r.title).sort()).toEqual(EXAMPLE_RECIPES.map((r) => r.title.fr).sort());
      expect(recipes.every((r) => r.inCookbook && !r.inImported && r.mealSlots.length > 0 && r.ingredients.length > 0 && r.photoUrl?.startsWith("/examples/"))).toBe(true);
      const items = await prisma.pantryInventoryItem.findMany({ where: marked(fr.id) });
      expect(items.map((i) => i.name).sort()).toEqual(EXAMPLE_ITEMS.map((i) => i.name.fr).sort());

      const en = await member("en", { locale: "en" });
      const english = await prisma.pantryInventoryItem.findMany({ where: marked(en.id) });
      expect(english.map((i) => i.name).sort()).toEqual(EXAMPLE_ITEMS.map((i) => i.name.en).sort());
      const steps = (await prisma.recipe.findFirst({ where: { ...marked(en.id), title: EXAMPLE_RECIPES[0].title.en } })).instructions;
      expect(JSON.parse(steps)).toEqual(EXAMPLE_RECIPES[0].steps.en);
    });

    it("plans the week from the day the account is made, in Quebec days, and dates the Inventory the same way", async () => {
      const { id } = await member("days");
      const today = quebecDay();
      const entries = await prisma.plannerEntry.findMany({ where: marked(id), include: { recipe: true } });
      const days = entries.map((e) => addDays(e.weekStart, e.dayOfWeek)).sort();
      expect(days).toEqual(EXAMPLE_PLAN.map((p) => addDays(today, p.day)).sort());
      expect(entries.every((e) => e.weekStart === mondayKey(addDays(e.weekStart, e.dayOfWeek)))).toBe(true);
      expect(entries.filter((e) => e.isLeftover)).toHaveLength(1);
      const tonight = entries.find((e) => addDays(e.weekStart, e.dayOfWeek) === today);
      expect(tonight.mealType).toBe("dinner");
      const items = await prisma.pantryInventoryItem.findMany({ where: marked(id) });
      for (const spec of EXAMPLE_ITEMS) {
        const item = items.find((i) => i.name === spec.name.fr);
        expect(item.expiresAt.toISOString()).toBe(`${addDays(today, spec.days)}T00:00:00.000Z`);
      }
      const lasagna = items.find((i) => i.isPreparedMeal);
      expect([lasagna.location, lasagna.shelf]).toEqual(["freezer", null]);
    });

    it("leaves the three Restaurant / YOLO / N/A cards as they were, unmarked", async () => {
      const { id } = await member("cards");
      const cards = await prisma.recipe.findMany({ where: { userId: id, isPlaceholder: true } });
      expect(cards).toHaveLength(3);
      expect(cards.some((c) => c.isExample)).toBe(false);
    });

    it("makes no examples when the switch is off", async () => {
      process.env.NEW_ACCOUNT_EXAMPLES = "off";
      const { id } = await member("off");
      expect(await tally(id)).toEqual({ recipes: 0, plannedMeals: 0, inventoryItems: 0 });
    });

    it("still works when making the examples fails: the account, the session and the invite use are all there", async () => {
      const original = prisma.$transaction.bind(prisma);
      // Only the examples' transaction (the one with a timeout) fails.
      vi.spyOn(prisma, "$transaction").mockImplementation((fn, options) => {
        if (options?.timeout) return Promise.reject(new Error("the examples could not be saved"));
        return original(fn, options);
      });
      vi.spyOn(console, "error").mockImplementation(() => {});
      const invite = await prisma.inviteCode.create({ data: { code: generateCode(), maxUses: 1 } });
      createdCodes.push(invite.id);
      const email = `fails-${stamp}@example.com`;
      const res = await call("/api/auth/signup", { method: "POST", body: { email, password: "longenough1", inviteCode: invite.code } });
      expect(res.status).toBe(201);
      createdUsers.push(res.data.id);
      expect(res.cookie).toMatch(/^session=/);
      expect((await prisma.inviteCode.findUnique({ where: { id: invite.id } })).usedCount).toBe(1);
      expect(await tally(res.data.id)).toEqual({ recipes: 0, plannedMeals: 0, inventoryItems: 0 });
      vi.restoreAllMocks();
      // Nothing half-made, and the account menu's « Ajouter des exemples » is open to them.
      const me = await call("/api/examples", { cookie: res.cookie });
      expect(me.data.canAdd).toBe(true);
      expect((await call("/api/examples", { method: "POST", cookie: res.cookie })).status).toBe(201);
      expect(await tally(res.data.id)).toEqual(FULL);
    });
  });

  describe("what the banner and the sheets say", () => {
    it("counts exactly what removing would take, and what adding would add", async () => {
      const { cookie } = await member("counts", { locale: "en" });
      const res = await call("/api/examples", { cookie });
      expect(res.data.counts).toEqual({ ...FULL, total: 26 });
      expect(res.data.canAdd).toBe(false);
      expect(res.data.preview).toEqual({ ...FULL, itemNames: EXAMPLE_ITEMS.map((i) => i.name.en) });
    });

    it("keeps the examples out of the Add form's Recent chips", async () => {
      const { cookie } = await member("recent");
      expect((await call("/api/pantry-inventory/recent", { cookie })).data).toEqual([]);
      await call("/api/pantry-inventory", { method: "POST", cookie, body: { name: "Mon propre article", quantity: 1 } });
      expect((await call("/api/pantry-inventory/recent", { cookie })).data.map((r) => r.name)).toEqual(["Mon propre article"]);
    });
  });

  describe("« Retirer les exemples »", () => {
    it("takes exactly the examples and nothing else", async () => {
      const { cookie, id } = await member("exact");
      // What the person made themselves, in all three places.
      const mine = (await call("/api/recipes", { method: "POST", cookie, body: { title: "Ma recette", ingredients: [{ name: "riz" }], mealSlots: ["dinner"] } })).data;
      const myMeal = (await call("/api/planner", { method: "POST", cookie, body: { recipeId: mine.id, weekStart: "2031-01-06", dayOfWeek: 2, mealType: "dinner" } })).data;
      const myItem = (await call("/api/pantry-inventory", { method: "POST", cookie, body: { name: "Mon riz", quantity: 1, unit: "kg", location: "pantry" } })).data;
      const cardsBefore = await prisma.recipe.count({ where: { userId: id, isExample: false } });

      const res = await call("/api/examples", { method: "DELETE", cookie });
      expect(res.data.removed).toEqual(FULL);
      expect(await tally(id)).toEqual({ recipes: 0, plannedMeals: 0, inventoryItems: 0 });
      // Theirs are all still there.
      expect(await prisma.recipe.count({ where: { userId: id, isExample: false } })).toBe(cardsBefore);
      expect(await prisma.recipe.findUnique({ where: { id: mine.id } })).not.toBeNull();
      expect(await prisma.plannerEntry.findUnique({ where: { id: myMeal.id } })).not.toBeNull();
      expect(await prisma.pantryInventoryItem.findUnique({ where: { id: myItem.id } })).not.toBeNull();
      expect(await prisma.plannerEntry.count({ where: { userId: id } })).toBe(1);
      expect(await prisma.pantryInventoryItem.count({ where: { userId: id } })).toBe(1);
      // Nothing was written where "used up" things go, and the banner has nothing to say.
      expect((await call("/api/pantry-inventory/removed", { cookie })).data).toEqual([]);
      expect(await prisma.pantryConsumptionLog.count({ where: { userId: id } })).toBe(0);
      expect((await call("/api/examples", { cookie })).data.counts.total).toBe(0);
    });

    it("never touches another account", async () => {
      const a = await member("iso-a");
      const b = await member("iso-b");
      await call("/api/examples", { method: "DELETE", cookie: a.cookie });
      expect(await tally(a.id)).toEqual({ recipes: 0, plannedMeals: 0, inventoryItems: 0 });
      expect(await tally(b.id)).toEqual(FULL);
    });

    it("keeps a sample recipe the person edited, and still removes its planned meals", async () => {
      const { cookie, id } = await member("edited");
      const soup = await prisma.recipe.findFirst({ where: { ...marked(id), title: EXAMPLE_RECIPES[1].title.fr }, include: { ingredients: true } });
      const edit = await call(`/api/recipes/${soup.id}`, { method: "PUT", cookie, body: { notes: "Moins de sel la prochaine fois." } });
      expect(edit.data.isExample).toBe(false);

      const res = await call("/api/examples", { method: "DELETE", cookie });
      expect(res.data.removed).toEqual({ recipes: 7, plannedMeals: 6, inventoryItems: 12 });
      const kept = await prisma.recipe.findUnique({ where: { id: soup.id }, include: { ingredients: true } });
      expect(kept.notes).toBe("Moins de sel la prochaine fois.");
      expect(kept.ingredients).toHaveLength(soup.ingredients.length);
      expect(kept.isExample).toBe(false);
    });

    it("keeps a sample recipe the person planned again, together with their own planned meal", async () => {
      const { cookie, id } = await member("planned");
      const salad = await prisma.recipe.findFirst({ where: { ...marked(id), title: EXAMPLE_RECIPES[6].title.fr } });
      const own = await call("/api/planner", { method: "POST", cookie, body: { recipeId: salad.id, weekStart: "2031-01-06", dayOfWeek: 0, mealType: "lunch" } });
      expect(own.status).toBe(201);
      expect(own.data.isExample).toBe(false);
      expect((await prisma.recipe.findUnique({ where: { id: salad.id } })).isExample).toBe(false);

      const res = await call("/api/examples", { method: "DELETE", cookie });
      expect(res.data.removed.recipes).toBe(7);
      expect(await prisma.recipe.findUnique({ where: { id: salad.id } })).not.toBeNull();
      expect(await prisma.plannerEntry.findUnique({ where: { id: own.data.id } })).not.toBeNull();
    });

    it("keeps a sample recipe the person cooked, and the meal they cooked", async () => {
      const { cookie, id } = await member("cooked");
      const entry = await prisma.plannerEntry.findFirst({ where: { ...marked(id), isLeftover: false }, include: { recipe: true }, orderBy: [{ weekStart: "asc" }, { dayOfWeek: "asc" }] });
      const done = await call(`/api/planner/${entry.id}`, { method: "PUT", cookie, body: { cookedAt: new Date().toISOString() } });
      expect(done.status).toBe(200);
      expect((await prisma.recipe.findUnique({ where: { id: entry.recipeId } })).isExample).toBe(false);
      expect((await prisma.plannerEntry.findUnique({ where: { id: entry.id } })).isExample).toBe(false);

      const res = await call("/api/examples", { method: "DELETE", cookie });
      expect(res.data.removed).toEqual({ recipes: 7, plannedMeals: 5, inventoryItems: 12 });
      expect(await prisma.recipe.findUnique({ where: { id: entry.recipeId } })).not.toBeNull();
      expect(await prisma.plannerEntry.findUnique({ where: { id: entry.id } })).not.toBeNull();
    });

    it("keeps a planned meal the person moved, and copying a week makes the recipes theirs", async () => {
      const { cookie, id } = await member("moved");
      const entries = await prisma.plannerEntry.findMany({ where: { ...marked(id), isLeftover: false }, orderBy: [{ weekStart: "asc" }, { dayOfWeek: "asc" }] });
      const moved = entries[0];
      await call(`/api/planner/${moved.id}`, { method: "PUT", cookie, body: { servings: 2 } });
      expect((await prisma.plannerEntry.findUnique({ where: { id: moved.id } })).isExample).toBe(false);

      const copied = await call("/api/planner/copy-week", { method: "POST", cookie, body: { fromWeekStart: entries[1].weekStart, toWeekStart: "2031-02-03" } });
      expect(copied.status).toBe(201);
      const source = await prisma.plannerEntry.findMany({ where: { userId: id, weekStart: entries[1].weekStart } });
      const copiedRecipeIds = new Set(source.map((e) => e.recipeId));
      for (const recipeId of copiedRecipeIds) expect((await prisma.recipe.findUnique({ where: { id: recipeId } })).isExample).toBe(false);

      await call("/api/examples", { method: "DELETE", cookie });
      expect(await prisma.plannerEntry.findUnique({ where: { id: moved.id } })).not.toBeNull();
      expect(await prisma.plannerEntry.count({ where: { userId: id, weekStart: "2031-02-03" } })).toBe(copied.data.createdIds.length);
    });

    it("keeps an Inventory item the person edited, moved or cooked from, and the one they cooked is theirs", async () => {
      const { cookie, id } = await member("items");
      const find = (name) => prisma.pantryInventoryItem.findFirst({ where: { ...marked(id), name } });
      const eggs = await find("Œufs");
      const milk = await find("Lait");
      const rice = await find("Spaghetti");
      const edited = await call(`/api/pantry-inventory/${eggs.id}`, { method: "PUT", cookie, body: { quantity: 6 } });
      expect(edited.data.isExample).toBe(false);
      const stored = await call("/api/pantry-inventory/storage", { method: "POST", cookie, body: { items: [{ id: milk.id, location: "freezer" }] } });
      expect(stored.status).toBe(200);
      const cooked = await call("/api/pantry-inventory/take-out", { method: "POST", cookie, body: { takes: [{ id: rice.id, amount: 100 }] } });
      expect(cooked.status).toBe(200);

      const res = await call("/api/examples", { method: "DELETE", cookie });
      expect(res.data.removed.inventoryItems).toBe(9);
      for (const item of [eggs, milk, rice]) expect(await prisma.pantryInventoryItem.findUnique({ where: { id: item.id } })).not.toBeNull();
      expect((await prisma.pantryInventoryItem.findUnique({ where: { id: rice.id } })).quantity).toBe(350);
    });

    it("never deletes a recipe that something of the person's still uses, even if the mark was left on it", async () => {
      const { cookie, id } = await member("guard");
      const salad = await prisma.recipe.findFirst({ where: { ...marked(id), title: EXAMPLE_RECIPES[6].title.fr } });
      // A meal of theirs made without lifting the mark (as a forgotten route would).
      const own = await prisma.plannerEntry.create({ data: { userId: id, recipeId: salad.id, weekStart: "2031-01-06", dayOfWeek: 3, mealType: "dinner" } });
      const res = await call("/api/examples", { method: "DELETE", cookie });
      expect(res.data.removed.recipes).toBe(7);
      expect(await prisma.plannerEntry.findUnique({ where: { id: own.id } })).not.toBeNull();
      const kept = await prisma.recipe.findUnique({ where: { id: salad.id } });
      expect(kept).not.toBeNull();
      expect(kept.isExample).toBe(false); // it is theirs now, so it stops wearing the tag
    });
  });

  describe("Undo", () => {
    it("puts back exactly what was removed: the same rows, the same ids, the mark on", async () => {
      const { cookie, id } = await member("undo");
      const before = {
        recipes: await prisma.recipe.findMany({ where: marked(id), include: { ingredients: { orderBy: { position: "asc" } } }, orderBy: { id: "asc" } }),
        entries: await prisma.plannerEntry.findMany({ where: marked(id), orderBy: { id: "asc" } }),
        items: await prisma.pantryInventoryItem.findMany({ where: marked(id), orderBy: { id: "asc" } }),
      };
      await call("/api/examples", { method: "DELETE", cookie });
      expect(await tally(id)).toEqual({ recipes: 0, plannedMeals: 0, inventoryItems: 0 });

      const undone = await call("/api/examples/undo", { method: "POST", cookie });
      expect(undone.data.restored).toEqual(FULL);
      const after = {
        recipes: await prisma.recipe.findMany({ where: marked(id), include: { ingredients: { orderBy: { position: "asc" } } }, orderBy: { id: "asc" } }),
        entries: await prisma.plannerEntry.findMany({ where: marked(id), orderBy: { id: "asc" } }),
        items: await prisma.pantryInventoryItem.findMany({ where: marked(id), orderBy: { id: "asc" } }),
      };
      expect(after).toEqual(before);
      // Once. The copy is gone.
      expect((await call("/api/examples/undo", { method: "POST", cookie })).status).toBe(404);
      expect(await prisma.exampleRemoval.count({ where: { userId: id } })).toBe(0);
    });

    it("puts back only what that removal took, leaving what the person has now as it is", async () => {
      const { cookie, id } = await member("undo-mine");
      const soup = await prisma.recipe.findFirst({ where: { ...marked(id), title: EXAMPLE_RECIPES[1].title.fr } });
      await call(`/api/recipes/${soup.id}`, { method: "PUT", cookie, body: { notes: "à moi" } });
      await call("/api/examples", { method: "DELETE", cookie });
      const mine = (await call("/api/pantry-inventory", { method: "POST", cookie, body: { name: "Ajouté après", quantity: 1 } })).data;
      const undone = await call("/api/examples/undo", { method: "POST", cookie });
      expect(undone.data.restored).toEqual({ recipes: 7, plannedMeals: 6, inventoryItems: 12 });
      expect((await prisma.recipe.findUnique({ where: { id: soup.id } })).notes).toBe("à moi");
      expect(await prisma.pantryInventoryItem.findUnique({ where: { id: mine.id } })).not.toBeNull();
    });

    it("is gone after a day, and when the examples are added again", async () => {
      const { cookie, id } = await member("undo-late");
      await call("/api/examples", { method: "DELETE", cookie });
      expect(await undoRemoval(id, { now: new Date(Date.now() + UNDO_KEEP_MS + 60_000) })).toBeNull();
      expect(await prisma.exampleRemoval.count({ where: { userId: id } })).toBe(0);

      await call("/api/examples", { method: "DELETE", cookie }); // nothing to remove: no copy is kept for nothing
      expect(await prisma.exampleRemoval.count({ where: { userId: id } })).toBe(0);
      await call("/api/examples", { method: "POST", cookie });
      await call("/api/examples", { method: "DELETE", cookie });
      expect(await prisma.exampleRemoval.count({ where: { userId: id } })).toBe(1);
      await call("/api/examples", { method: "POST", cookie });
      expect(await prisma.exampleRemoval.count({ where: { userId: id } })).toBe(0);
    });
  });

  describe("« Ajouter des exemples »", () => {
    it("adds the whole set to an account with none, once, in the account's language, next to what is theirs", async () => {
      process.env.NEW_ACCOUNT_EXAMPLES = "off";
      const { cookie, id } = await member("add", { locale: "en" });
      delete process.env.NEW_ACCOUNT_EXAMPLES;
      await call("/api/pantry-inventory", { method: "POST", cookie, body: { name: "Already mine", quantity: 2 } });
      expect((await call("/api/examples", { cookie })).data.canAdd).toBe(true);

      const added = await call("/api/examples", { method: "POST", cookie, lang: "en" });
      expect(added.status).toBe(201);
      expect(added.data.added).toEqual(FULL);
      expect(await tally(id)).toEqual(FULL);
      expect((await prisma.pantryInventoryItem.findFirst({ where: { ...marked(id), name: "Eggs" } })) !== null).toBe(true);
      expect(await prisma.pantryInventoryItem.count({ where: { userId: id, isExample: false } })).toBe(1);

      const again = await call("/api/examples", { method: "POST", cookie });
      expect(again.status).toBe(409);
      expect(again.data.code).toBe("examplesPresent");
      expect(await tally(id)).toEqual(FULL);
    });
  });
});

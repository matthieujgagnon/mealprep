import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const { prisma } = await import("../lib/prisma.js");
const { pantryInventoryRouter } = await import("./pantryInventory.js");

// A planned prepared RECIPE (« Plat préparé ») is eaten from the prepared meal in Inventory once
// its day has passed: one box off, once, the meal settled whether or not anything matched, only
// from a prepared meal of this person, with an Undo that puts the box back. The browser's matcher
// says which item it is (the server only checks). Skipped when no database is reachable.
let dbUp = true;
try {
  await prisma.$queryRaw`SELECT 1`;
} catch {
  dbUp = false;
}

describe.skipIf(!dbUp)("a planned prepared recipe's day passes (database)", () => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  let server;
  let base;
  let userId;
  let otherId;

  async function call(url, { method = "GET", body } = {}) {
    const res = await fetch(`${base}${url}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json().catch(() => null) };
  }
  const recipe = (title, extra = {}) => prisma.recipe.create({ data: { userId, title, instructions: "[]", ingredients: { create: [{ name: title.toLowerCase() }] }, ...extra } });
  const planned = (recipeId, extra = {}) => prisma.plannerEntry.create({ data: { userId, recipeId, weekStart: "2026-10-12", dayOfWeek: 1, mealType: "breakfast", ...extra } });
  const item = (name, extra = {}) => prisma.pantryInventoryItem.create({ data: { userId, name, core: name.toLowerCase(), location: "freezer", quantity: 4, unit: "unit", ...extra } });
  const entry = (id) => prisma.plannerEntry.findUnique({ where: { id } });
  const stock = async (id) => (await prisma.pantryInventoryItem.findUnique({ where: { id } }))?.quantity;
  const TODAY = "2026-10-15"; // the planned days below (Tuesday Oct 13) are before it

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `prepared-due-${stamp}@example.com`, passwordHash: "x" } });
    const other = await prisma.user.create({ data: { email: `prepared-due-other-${stamp}@example.com`, passwordHash: "x" } });
    userId = user.id;
    otherId = other.id;
    const app = express();
    app.use(express.json());
    app.use("/api/pantry-inventory", (req, _res, next) => {
      req.userId = userId;
      next();
    }, pantryInventoryRouter);
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
    await prisma.$disconnect();
  });

  it("lists only the prepared recipes whose day has passed and that have not been settled", async () => {
    const croissants = await recipe("Croissants", { isPrepared: true });
    const pasta = await recipe("Pasta"); // a real recipe: nothing to eat from Inventory
    const due = await planned(croissants.id);
    await planned(pasta.id);
    await planned(croissants.id, { dayOfWeek: 5 }); // Saturday Oct 17: not yet
    await planned(croissants.id, { dayOfWeek: 0, cookedAt: new Date() }); // already settled
    await planned(croissants.id, { dayOfWeek: 2, isLeftover: true }); // a leftover is its own thing
    const { status, data } = await call(`/api/pantry-inventory/prepared-recipes/due?today=${TODAY}`);
    expect(status).toBe(200);
    expect(data.map((d) => d.entryId)).toEqual([due.id]);
    expect(data[0].recipe).toMatchObject({ title: "Croissants", ingredients: [{ name: "croissants" }] });
    expect((await call("/api/pantry-inventory/prepared-recipes/due")).status).toBe(400);
    expect((await call("/api/pantry-inventory/prepared-recipes/due?today=2026-02-31")).status).toBe(400);
    await prisma.plannerEntry.deleteMany({ where: { userId } });
  });

  it("takes one box off the matched prepared meal, once, marks the meal eaten, and Undo puts the box back", async () => {
    const croissants = await recipe("Croissants", { isPrepared: true });
    const meal = await item("Croissants", { isPreparedMeal: true });
    const first = await planned(croissants.id);
    const second = await planned(croissants.id, { dayOfWeek: 2 });
    const matches = [first, second].map((e) => ({ entryId: e.id, itemId: meal.id }));
    const done = await call("/api/pantry-inventory/prepared-recipes/settle", { method: "POST", body: { today: TODAY, matches } });
    expect(done.status).toBe(200);
    expect(done.data.entryIds.sort()).toEqual([first.id, second.id].sort());
    expect(done.data.meals).toEqual([{ title: "Croissants", count: 2, prepared: true }]);
    expect(await stock(meal.id)).toBe(2); // one box per planned meal
    expect((await entry(first.id)).cookedAt).not.toBeNull();

    // Once: nothing is due now, and a second call takes nothing.
    expect((await call(`/api/pantry-inventory/prepared-recipes/due?today=${TODAY}`)).data).toEqual([]);
    const again = await call("/api/pantry-inventory/prepared-recipes/settle", { method: "POST", body: { today: TODAY, matches } });
    expect(again.data).toMatchObject({ entryIds: [], meals: [] });
    expect(await stock(meal.id)).toBe(2);

    // Undo: the rows as they were (the meals stay counted, so the boxes are not taken again).
    const back = await call("/api/pantry-inventory/put-back", { method: "POST", body: { rows: done.data.before, logIds: done.data.logIds } });
    expect(back.status).toBe(200);
    expect(await stock(meal.id)).toBe(4);
    expect((await call(`/api/pantry-inventory/prepared-recipes/due?today=${TODAY}`)).data).toEqual([]);
    await prisma.plannerEntry.deleteMany({ where: { userId } });
  });

  it("the last box leaves Inventory (Recently removed), and a prepared meal counted by weight comes off whole", async () => {
    const lasagna = await recipe("Lasagna", { isPrepared: true });
    const last = await item("Lasagna", { isPreparedMeal: true, quantity: 1 });
    const heavy = await item("Pizza", { isPreparedMeal: true, quantity: 900, unit: "g" });
    const pizza = await recipe("Pizza", { isPrepared: true });
    const a = await planned(lasagna.id);
    const b = await planned(pizza.id, { dayOfWeek: 2 });
    const done = await call("/api/pantry-inventory/prepared-recipes/settle", {
      method: "POST",
      body: { today: TODAY, matches: [{ entryId: a.id, itemId: last.id }, { entryId: b.id, itemId: heavy.id }] },
    });
    expect(done.data.removedIds.sort()).toEqual([last.id, heavy.id].sort());
    expect(await stock(last.id)).toBeUndefined();
    expect(await stock(heavy.id)).toBeUndefined();
    await prisma.plannerEntry.deleteMany({ where: { userId } });
  });

  it("settles a meal with no match without taking anything, and never eats an ingredient, a leftover or someone else's item", async () => {
    const croissants = await recipe("Croissants", { isPrepared: true });
    const ingredient = await item("Croissants"); // not a prepared meal
    const leftover = await item("Croissants leftover", { isLeftover: true, unit: "portion" });
    const theirs = await prisma.pantryInventoryItem.create({ data: { userId: otherId, name: "Croissants", core: "croissants", location: "freezer", quantity: 4, unit: "unit", isPreparedMeal: true } });
    const none = await planned(croissants.id);
    const wrong = await planned(croissants.id, { dayOfWeek: 2 });
    const done = await call("/api/pantry-inventory/prepared-recipes/settle", {
      method: "POST",
      body: { today: TODAY, matches: [{ entryId: wrong.id, itemId: ingredient.id }, { entryId: wrong.id, itemId: leftover.id }, { entryId: wrong.id, itemId: theirs.id }, { entryId: "not-mine", itemId: ingredient.id }] },
    });
    expect(done.status).toBe(200);
    expect(done.data.meals).toEqual([]);
    expect(done.data.entryIds.sort()).toEqual([none.id, wrong.id].sort()); // both settled, so a prepared meal added later is never eaten for a past day
    expect(await stock(ingredient.id)).toBe(4);
    expect(await stock(leftover.id)).toBe(4);
    expect(await stock(theirs.id)).toBe(4);
    expect((await entry(none.id)).cookedAt).not.toBeNull();
    await prisma.plannerEntry.deleteMany({ where: { userId } });
  });

  it("is a no-op with nothing due", async () => {
    const done = await call("/api/pantry-inventory/prepared-recipes/settle", { method: "POST", body: { today: TODAY, matches: [] } });
    expect(done.data).toEqual({ before: [], removedIds: [], logIds: [], items: [], entryIds: [], meals: [] });
    expect((await call("/api/pantry-inventory/prepared-recipes/settle", { method: "POST", body: {} })).status).toBe(400);
  });
});

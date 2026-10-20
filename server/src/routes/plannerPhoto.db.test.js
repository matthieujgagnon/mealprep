import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const { prisma } = await import("../lib/prisma.js");
const { pantryInventoryRouter } = await import("./pantryInventory.js");
const { plannerRouter } = await import("./planner.js");

// A planned prepared meal's photo, against the real database. The entry keeps a COPY of the
// linked Inventory item's photo, only as the fallback for when the item has left Inventory:
// linking copies it, a changed photo is copied to the entries that eat the item, an Undo that
// sends the copy keeps it, and the calendar's day list reads the photo live from the item.
// Skipped when no database is reachable.
let dbUp = true;
try {
  await prisma.$queryRaw`SELECT 1`;
} catch {
  dbUp = false;
}

describe.skipIf(!dbUp)("A planned prepared meal's photo (database)", () => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const WEEK = "2026-10-19";
  let server;
  let base;
  let userId;

  async function call(path, { method = "GET", body } = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json().catch(() => null) };
  }

  const addMeal = async (data) =>
    (await call("/api/pantry-inventory", { method: "POST", body: { location: "freezer", quantity: 4, unit: "portion", isPreparedMeal: true, ...data } })).data;

  // A planned prepared meal as the app makes it: a note, then its marks and its link.
  async function plan(item, dayOfWeek, extra = {}) {
    const note = (await call("/api/planner/blank", { method: "POST", body: { weekStart: WEEK, dayOfWeek, mealType: "dinner", note: `Plat préparé · ${item.name}` } })).data;
    const linked = await call(`/api/planner/${note.id}`, { method: "PUT", body: { isLeftover: true, leftoverItemId: item.id, ...extra } });
    return linked.data;
  }

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `planner-photo-${stamp}@example.com`, passwordHash: "x" } });
    userId = user.id;
    const app = express();
    app.use(express.json());
    const own = (req, _res, next) => {
      req.userId = userId;
      next();
    };
    app.use("/api/pantry-inventory", own, pantryInventoryRouter);
    app.use("/api/planner", own, plannerRouter);
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await new Promise((resolve) => server?.close(resolve));
  });

  it("linking a note to an Inventory meal copies the meal's photo onto the entry", async () => {
    const lasagne = await addMeal({ name: "Lasagne", imageUrl: "https://example.com/lasagne.jpg" });
    const entry = await plan(lasagne, 0);
    expect(entry.photoUrl).toBe("https://example.com/lasagne.jpg");
  });

  it("a meal with no picture leaves the copy empty, and 'none' is not a picture", async () => {
    const bare = await addMeal({ name: "Perogies" });
    const none = await addMeal({ name: "Tourtière", imageUrl: "none" });
    expect((await plan(bare, 1)).photoUrl).toBeNull();
    expect((await plan(none, 2)).photoUrl).toBeNull();
  });

  it("a changed photo is copied to every planned meal that eats the item; removing it clears the copy", async () => {
    const pizza = await addMeal({ name: "Pizza", imageUrl: "https://example.com/pizza-1.jpg" });
    const a = await plan(pizza, 3);
    const b = await plan(pizza, 4);
    await call(`/api/pantry-inventory/${pizza.id}`, { method: "PUT", body: { imageUrl: "https://example.com/pizza-2.jpg" } });
    expect((await prisma.plannerEntry.findMany({ where: { id: { in: [a.id, b.id] } } })).map((e) => e.photoUrl)).toEqual([
      "https://example.com/pizza-2.jpg",
      "https://example.com/pizza-2.jpg",
    ]);
    await call(`/api/pantry-inventory/${pizza.id}`, { method: "PUT", body: { imageUrl: null } });
    expect((await prisma.plannerEntry.findMany({ where: { id: { in: [a.id, b.id] } } })).map((e) => e.photoUrl)).toEqual([null, null]);
  });

  it("the copy stays once the item has left Inventory, and the calendar's day list falls back to it", async () => {
    const soup = await addMeal({ name: "Soupe", imageUrl: "https://example.com/soupe.jpg" });
    const entry = await plan(soup, 5);
    const day = (await call(`/api/planner/dates?from=${WEEK}&to=2026-10-25`)).data.find((d) => d.date === "2026-10-24");
    expect(day.meals[0]).toMatchObject({ photoUrl: "https://example.com/soupe.jpg", prepared: true });

    await call(`/api/pantry-inventory/${soup.id}`, { method: "DELETE" });
    expect((await prisma.plannerEntry.findUnique({ where: { id: entry.id } })).photoUrl).toBe("https://example.com/soupe.jpg");
    const after = (await call(`/api/planner/dates?from=${WEEK}&to=2026-10-25`)).data.find((d) => d.date === "2026-10-24");
    expect(after.meals[0]).toMatchObject({ photoUrl: "https://example.com/soupe.jpg", prepared: true });
  });

  it("the calendar reads the item's photo live, not the older copy", async () => {
    const chili = await addMeal({ name: "Chili", imageUrl: "https://example.com/chili-1.jpg" });
    const entry = await plan(chili, 6);
    // The copy is older than the item's photo (it could not be refreshed yet): the live photo wins.
    await prisma.plannerEntry.update({ where: { id: entry.id }, data: { photoUrl: "https://example.com/old.jpg" } });
    const day = (await call(`/api/planner/dates?from=${WEEK}&to=2026-10-25`)).data.find((d) => d.date === "2026-10-25");
    expect(day.meals[0].photoUrl).toBe("https://example.com/chili-1.jpg");
  });

  it("an Undo that puts a planned meal back sends its copy, and that copy is kept when the item is gone", async () => {
    const entry = (await call("/api/planner/blank", { method: "POST", body: { weekStart: "2026-10-26", dayOfWeek: 0, mealType: "lunch", note: "Plat préparé · Gone" } })).data;
    const back = await call(`/api/planner/${entry.id}`, {
      method: "PUT",
      body: { isLeftover: true, leftoverItemId: "no-such-item", photoUrl: "https://example.com/gone.jpg" },
    });
    expect(back.data.photoUrl).toBe("https://example.com/gone.jpg");
  });

  it("refuses a photo that is not a photo", async () => {
    const entry = (await call("/api/planner/blank", { method: "POST", body: { weekStart: "2026-10-26", dayOfWeek: 1, mealType: "lunch", note: "Note" } })).data;
    expect((await call(`/api/planner/${entry.id}`, { method: "PUT", body: { photoUrl: "javascript:alert(1)" } })).status).toBe(400);
  });
});

import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const { prisma } = await import("../lib/prisma.js");
const { pantryInventoryRouter } = await import("./pantryInventory.js");
const { pantryLocationsRouter } = await import("./pantryLocations.js");
const { inventoryLayoutRouter } = await import("./inventoryLayout.js");
const { suggestExpiration, suggestLocation } = await import("../lib/foodkeeper.js");

// WHERE an item is KEPT (location: fridge, freezer, pantry; the USDA estimate reads it) and WHICH
// SHELF it shows on (shelf) are two fields, against the real database: they stay apart through
// add, edit, move, Undo and Put back; the use-by estimate follows the storage only; deleting a
// shelf never loses where things are kept; no shelf gets the name of another; and the migration
// that added `shelf` merges Matt's « Prepared meals » shelf and deletes nothing.
// Skipped when no database is reachable.
let dbUp = true;
try {
  await prisma.$queryRaw`SELECT 1`;
} catch {
  dbUp = false;
}

const BOUGHT = "2026-10-20T12:00:00.000Z";

describe.skipIf(!dbUp)("storage and shelf (database)", () => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  let server;
  let base;
  let userId;
  let spices;

  async function call(url, { method = "GET", body } = {}) {
    const res = await fetch(`${base}${url}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json().catch(() => null) };
  }
  const add = async (data) => (await call("/api/pantry-inventory", { method: "POST", body: { purchasedAt: BOUGHT, quantity: 1, ...data } })).data;
  const put = (id, body) => call(`/api/pantry-inventory/${id}`, { method: "PUT", body });
  const row = (id) => prisma.pantryInventoryItem.findUnique({ where: { id } });

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `shelf-${stamp}@example.com`, passwordHash: "x" } });
    userId = user.id;
    const app = express();
    app.use(express.json());
    const own = (req, _res, next) => {
      req.userId = userId;
      next();
    };
    app.use("/api/pantry-inventory", own, pantryInventoryRouter);
    app.use("/api/pantry-locations", own, pantryLocationsRouter);
    app.use("/api/inventory-layout", own, inventoryLayoutRouter);
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
    spices = (await call("/api/pantry-locations", { method: "POST", body: { name: "Spices" } })).data;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await new Promise((resolve) => server?.close(resolve));
  });

  it("adding with a shelf keeps where it is kept, and the use-by comes from the storage", async () => {
    const item = await add({ name: "chicken breast", location: "freezer", shelf: spices.id });
    expect(item).toMatchObject({ location: "freezer", shelf: spices.id });
    expect(new Date(item.expiresAt).toISOString()).toBe(suggestExpiration("chicken breast", "freezer", new Date(BOUGHT)).toISOString());
    // The shelf life (the freshness bar's denominator) is the freezer's, not nothing.
    expect(item.shelfLifeDays).toBe(item.locations.freezer.defaultDays);
    const fridge = await add({ name: "chicken breast", location: "fridge" });
    expect(item.shelfLifeDays).toBeGreaterThan(fridge.shelfLifeDays);
  });

  it("moving to another shelf changes only the shelf; changing the storage keeps the shelf", async () => {
    const item = await add({ name: "peas", location: "freezer" });
    const moved = await put(item.id, { shelf: spices.id });
    expect(moved.status).toBe(200);
    expect(await row(item.id)).toMatchObject({ location: "freezer", shelf: spices.id, expiresAt: new Date(item.expiresAt) });
    await put(item.id, { location: "fridge" });
    expect(await row(item.id)).toMatchObject({ location: "fridge", shelf: spices.id });
    // null puts it back on its default shelf.
    await put(item.id, { shelf: null });
    expect(await row(item.id)).toMatchObject({ location: "fridge", shelf: null });
  });

  it("a built-in shelf can be chosen; one that is not a shelf is refused", async () => {
    const item = await add({ name: "perogies", location: "freezer", shelf: "prepared" });
    expect(item.shelf).toBe("prepared");
    expect((await put(item.id, { shelf: "freezer" })).status).toBe(200);
    expect((await put(item.id, { shelf: "nope" })).status).toBe(400);
    expect((await put(item.id, { shelf: "leftovers" })).status).toBe(400);
    expect((await put(item.id, { location: "prepared" })).status).toBe(400);
    expect((await call("/api/pantry-inventory", { method: "POST", body: { name: "x", shelf: "nope" } })).status).toBe(400);
  });

  it("an app or tab that still sends a section as the location is read as the shelf, and the storage is kept", async () => {
    const item = await add({ name: "frozen peas", location: "freezer" });
    await put(item.id, { location: spices.id });
    expect(await row(item.id)).toMatchObject({ location: "freezer", shelf: spices.id });
    // Adding that way guesses where it is kept from the name.
    const fresh = await add({ name: "frozen berries", location: spices.id });
    expect(fresh).toMatchObject({ location: suggestLocation("frozen berries"), shelf: spices.id });
    expect(fresh.location).toBe("freezer");
  });

  it("a leftover has no shelf of its own", async () => {
    const leftover = await add({ name: "Chili", location: "fridge", unit: "portion", isLeftover: true, shelf: spices.id });
    expect(leftover.shelf).toBeNull();
    const item = await add({ name: "rice", location: "pantry", shelf: spices.id });
    await put(item.id, { isLeftover: true });
    expect((await row(item.id)).shelf).toBeNull();
  });

  it("Recently removed and Undo put it back with both fields", async () => {
    const item = await add({ name: "lasagna", location: "freezer", shelf: spices.id });
    expect((await call(`/api/pantry-inventory/${item.id}`, { method: "DELETE" })).status).toBe(204);
    expect(await row(item.id)).toBeNull();
    const [entry] = (await call("/api/pantry-inventory/removed")).data.filter((e) => e.itemId === item.id);
    expect(entry.item).toMatchObject({ location: "freezer", shelf: spices.id });
    const back = await call(`/api/pantry-inventory/removed/${entry.id}/put-back`, { method: "POST" });
    expect(back.data).toMatchObject({ id: item.id, location: "freezer", shelf: spices.id });

    // A take-out's Undo (put-back with the rows as they were) keeps both too.
    const taken = await call("/api/pantry-inventory/take-out", { method: "POST", body: { takes: [{ id: item.id, amount: "all" }] } });
    expect(await row(item.id)).toBeNull();
    const undone = await call("/api/pantry-inventory/put-back", { method: "POST", body: { rows: taken.data.before } });
    expect(undone.data[0]).toMatchObject({ id: item.id, location: "freezer", shelf: spices.id });
  });

  it("a snapshot from before the two were kept apart (the shelf in `location`) is put back on that shelf", async () => {
    const id = `legacy-${stamp}`;
    const rows = [{ id, name: "Old item", location: spices.id, quantity: 1 }];
    const back = await call("/api/pantry-inventory/put-back", { method: "POST", body: { rows } });
    expect(back.data[0]).toMatchObject({ id, shelf: spices.id });
    // A shelf that no longer exists: the default shelf, and the Pantry for where it is kept.
    const gone = await call("/api/pantry-inventory/put-back", { method: "POST", body: { rows: [{ id: `${id}-2`, name: "Gone", location: "deleted-shelf", shelf: "deleted-shelf" }] } });
    expect(gone.data[0]).toMatchObject({ location: "pantry", shelf: null });
  });

  it("the storage list: only `location` changes, never the shelf or the use-by date, and Undo puts the row back as it was", async () => {
    const stranded = await prisma.pantryInventoryItem.create({
      data: { userId, name: "Vol-au-vent", core: "vol-au-vent", location: spices.id, shelf: spices.id, expiresAt: new Date("2026-12-24T00:00:00Z") },
    });
    expect((await call("/api/pantry-inventory/storage", { method: "POST", body: { items: [{ id: stranded.id, location: spices.id }] } })).status).toBe(400);
    const done = await call("/api/pantry-inventory/storage", { method: "POST", body: { items: [{ id: stranded.id, location: "freezer" }] } });
    expect(done.status).toBe(200);
    expect(done.data.items[0]).toMatchObject({ location: "freezer", shelf: spices.id });
    expect(await row(stranded.id)).toMatchObject({ location: "freezer", shelf: spices.id, expiresAt: new Date("2026-12-24T00:00:00Z") });
    // Undo: the row as it was, storage not known yet included.
    await call("/api/pantry-inventory/put-back", { method: "POST", body: { rows: done.data.before } });
    expect(await row(stranded.id)).toMatchObject({ location: spices.id, shelf: spices.id });
    // Another person's item is never touched.
    expect((await call("/api/pantry-inventory/storage", { method: "POST", body: { items: [{ id: "someone-elses", location: "fridge" }] } })).data.items).toEqual([]);
  });

  it("deleting a shelf puts its items on their default shelf and loses nothing about where they are kept", async () => {
    const section = (await call("/api/pantry-locations", { method: "POST", body: { name: "Garage" } })).data;
    const known = await add({ name: "ice cream", location: "freezer", shelf: section.id });
    const stranded = await prisma.pantryInventoryItem.create({ data: { userId, name: "frozen pizza", core: "frozen pizza", location: section.id, shelf: section.id } });
    expect((await call(`/api/pantry-locations/${section.id}`, { method: "DELETE" })).status).toBe(204);
    expect(await row(known.id)).toMatchObject({ location: "freezer", shelf: null });
    // Where the stranded one was kept had to be said: guessed from its name, as the list would.
    expect(await row(stranded.id)).toMatchObject({ location: "freezer", shelf: null });
  });

  it("no new or renamed shelf takes the name of another, in either language, and an old duplicate keeps working", async () => {
    for (const name of ["Fridge", "FRIGO", "congélateur", "Congelateur", "Garde-manger", "Leftovers", "Restes", "Prepared meals", "Plats préparés", "plats  prepares"]) {
      expect([name, (await call("/api/pantry-locations", { method: "POST", body: { name } })).status]).toEqual([name, 409]);
    }
    const mine = (await call("/api/pantry-locations", { method: "POST", body: { name: "Camping" } })).data;
    expect((await call(`/api/pantry-locations/${mine.id}`, { method: "PUT", body: { name: "Prepared meals" } })).status).toBe(409);
    expect((await call(`/api/pantry-locations/${mine.id}`, { method: "PUT", body: { name: "Cottage" } })).status).toBe(200);
    expect((await call("/api/pantry-locations", { method: "POST", body: { name: "Cottage" } })).status).toBe(409);

    // A name the person gave a built-in shelf is taken too.
    const layout = (sections) => call("/api/inventory-layout", { method: "PUT", body: { sections } });
    expect((await layout([{ sectionId: "pantry", label: "Cave", size: "c12:6" }])).status).toBe(200);
    expect((await call("/api/pantry-locations", { method: "POST", body: { name: "cave" } })).status).toBe(409);
    // A built-in shelf cannot be renamed onto a shelf of their own, or onto another built-in one.
    expect((await layout([{ sectionId: "pantry", label: "Cottage" }])).status).toBe(409);
    expect((await layout([{ sectionId: "pantry", label: "Frigo" }])).status).toBe(409);
    expect((await layout([{ sectionId: "pantry", label: "Cave" }, { sectionId: "freezer", label: "Cave" }])).status).toBe(409);

    // The old « Prepared meals » section that was merged keeps its name next to the built-in shelf
    // (until it is deleted): saving the layout again does not trip over it.
    const old = await prisma.pantryLocation.create({ data: { userId, name: "Prepared meals ", position: 50 } });
    // As the migration leaves it: the built-in shelf has its row, with his name as the label.
    await prisma.inventorySectionLayout.create({ data: { userId, sectionId: "prepared", label: "Prepared meals", position: 9, size: "c12:8" } });
    expect((await layout([{ sectionId: "prepared", label: "Prepared meals" }, { sectionId: old.id }])).status).toBe(200);
    expect((await layout([{ sectionId: "prepared", label: "Prepared meals" }, { sectionId: old.id }])).status).toBe(200);
    expect((await call(`/api/pantry-locations/${old.id}`, { method: "DELETE" })).status).toBe(204);
    // Undo of that delete brings the shelf back even though its name is a built-in shelf's: it is
    // not a new shelf. Only the Undo says so (`restore`); a new shelf of that name is still refused.
    expect((await call("/api/pantry-locations", { method: "POST", body: { name: "Prepared meals" } })).status).toBe(409);
    const back = await call("/api/pantry-locations", { method: "POST", body: { name: "Prepared meals", restore: true } });
    expect(back.status).toBe(201);
    expect(back.data.name).toBe("Prepared meals");
  });

  it("the migration that added `shelf` merges Matt's « Prepared meals » shelf, moves its place, size and name, and deletes nothing", async () => {
    const sql = fs
      .readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../prisma/migrations/20261020180000_inventory_shelf/migration.sql"), "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(sql).not.toMatch(/\b(DELETE|DROP|TRUNCATE)\b/i);
    // The data steps (the column is already there).
    const steps = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s && !/^ALTER TABLE/i.test(s));
    expect(steps).toHaveLength(3);

    const ids = (prefix) => `${prefix}-${stamp}`;
    const matt = await prisma.user.create({ data: { email: `shelf-matt-${stamp}@example.com`, passwordHash: "x" } });
    const friend = await prisma.user.create({ data: { email: `shelf-friend-${stamp}@example.com`, passwordHash: "x" } });
    try {
      const mine = await prisma.pantryLocation.create({ data: { id: ids("m_prep"), userId: matt.id, name: "Prepared meals", position: 0 } });
      const other = await prisma.pantryLocation.create({ data: { id: ids("m_spice"), userId: matt.id, name: "Spices", position: 1 } });
      const boxes = await prisma.pantryLocation.create({ data: { id: ids("f_boxes"), userId: friend.id, name: "Boîtes", position: 0 } });
      await prisma.inventorySectionLayout.createMany({
        data: [
          { userId: matt.id, sectionId: "fridge", position: 0, size: "c12:6" },
          { userId: matt.id, sectionId: mine.id, position: 3, size: "c12:8", height: 320 },
          { userId: matt.id, sectionId: other.id, position: 4, size: "c12:4" },
        ],
      });
      const item = (u, name, location, extra = {}) => prisma.pantryInventoryItem.create({ data: { userId: u.id, name, core: name.toLowerCase(), location, ...extra } });
      const perogies = await item(matt, "Perogies", mine.id, { expiresAt: new Date("2026-12-01T00:00:00Z") });
      const pastry = await item(matt, "Puff pastry", mine.id);
      const paprika = await item(matt, "Paprika", other.id);
      const milk = await item(matt, "Milk", "fridge");
      const beans = await item(friend, "Beans", boxes.id);
      const counts = async () => [await prisma.pantryInventoryItem.count({ where: { userId: { in: [matt.id, friend.id] } } }), await prisma.pantryLocation.count({ where: { userId: { in: [matt.id, friend.id] } } }), await prisma.inventorySectionLayout.count({ where: { userId: { in: [matt.id, friend.id] } } })];
      const before = await counts();

      for (const step of steps) await prisma.$executeRawUnsafe(step);

      expect(await counts()).toEqual(before); // nothing deleted, nothing added
      // Matt's items are on the built-in shelf, whether or not they are tagged; where they are kept and their dates are as they were.
      expect(await row(perogies.id)).toMatchObject({ shelf: "prepared", location: mine.id, expiresAt: new Date("2026-12-01T00:00:00Z") });
      expect(await row(pastry.id)).toMatchObject({ shelf: "prepared", isPreparedMeal: false, location: mine.id });
      // Any other section's items: the section is copied to `shelf`, where they are kept is not known yet (and not changed).
      expect(await row(paprika.id)).toMatchObject({ shelf: other.id, location: other.id });
      expect(await row(beans.id)).toMatchObject({ shelf: boxes.id, location: boxes.id });
      expect((await row(milk.id)).shelf).toBeNull();
      // The layout row (place, size, height) moved to the built-in shelf with his name; the old section row is still there, empty.
      const layout = await prisma.inventorySectionLayout.findMany({ where: { userId: matt.id }, orderBy: { position: "asc" } });
      expect(layout.map((l) => [l.sectionId, l.label, l.position, l.size, l.height])).toEqual([
        ["fridge", null, 0, "c12:6", null],
        ["prepared", "Prepared meals", 3, "c12:8", 320],
        [other.id, null, 4, "c12:4", null],
      ]);
      expect(await prisma.pantryLocation.findUnique({ where: { id: mine.id } })).not.toBeNull();
      expect(await prisma.pantryInventoryItem.count({ where: { userId: matt.id, OR: [{ shelf: mine.id }, { location: mine.id, NOT: { shelf: "prepared" } }] } })).toBe(0);
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: [matt.id, friend.id] } } });
    }
  });
});

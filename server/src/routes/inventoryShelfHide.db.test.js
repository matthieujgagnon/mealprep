import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const { prisma } = await import("../lib/prisma.js");
const { pantryInventoryRouter } = await import("./pantryInventory.js");
const { pantryLocationsRouter } = await import("./pantryLocations.js");
const { inventoryLayoutRouter } = await import("./inventoryLayout.js");

// Any shelf can be deleted, built-in or not, and deleting is HIDING: against the real database,
// the layout row stays (with its name, place and size), no Inventory row is touched, a save that
// does not list a hidden shelf does not drop it, the last shelf cannot go, and the items only
// go to a shelf that is showing. Skipped when no database is reachable.
let dbUp = true;
try {
  await prisma.$queryRaw`SELECT 1`;
} catch {
  dbUp = false;
}

const BUILT_IN = ["fridge", "freezer", "pantry", "leftovers", "prepared"];

describe.skipIf(!dbUp)("hiding a shelf (database)", () => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  let server;
  let base;
  let userId;
  let spices;

  async function call(url, { method = "GET", body } = {}) {
    const res = await fetch(`${base}${url}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json().catch(() => null) };
  }
  const layout = async () => (await call("/api/inventory-layout")).data;
  const rowOf = async (id) => (await layout()).find((r) => r.sectionId === id);
  // The whole layout as the page sends it: every shelf, in order, with its hiding as it is now.
  async function save(change = {}) {
    const ids = [...BUILT_IN, spices.id];
    const current = await layout();
    const rows = ids.map((sectionId) => {
      const row = current.find((r) => r.sectionId === sectionId);
      return { sectionId, label: row?.label ?? undefined, size: row?.size ?? "c12:6", height: row?.height ?? null, hidden: row?.hidden ?? false, movedTo: row?.movedTo ?? null, ...(change[sectionId] || {}) };
    });
    return call("/api/inventory-layout", { method: "PUT", body: { sections: rows } });
  }
  const add = async (data) => (await call("/api/pantry-inventory", { method: "POST", body: { quantity: 1, purchasedAt: "2026-10-20T12:00:00.000Z", ...data } })).data;
  const snapshot = () => prisma.pantryInventoryItem.findMany({ where: { userId }, orderBy: { id: "asc" } });

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `hide-${stamp}@example.com`, passwordHash: "x" } });
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

  it("a shelf with no layout row is shown, and a new row is shown too", async () => {
    expect(await layout()).toEqual([]);
    const saved = await save();
    expect(saved.status).toBe(200);
    for (const row of saved.data) expect(row).toMatchObject({ hidden: false, movedTo: null });
  });

  it("each built-in shelf, in turn, can be hidden and brought back: the row stays, no item is touched", async () => {
    await add({ name: "peas", location: "freezer" });
    await add({ name: "milk", location: "fridge" });
    await add({ name: "lasagna", location: "freezer", isPreparedMeal: true });
    await add({ name: "stew", location: "freezer", isLeftover: true, unit: "portion" });
    const items = await snapshot();
    for (const id of ["fridge", "freezer", "pantry", "prepared", "leftovers"]) {
      const target = id === "fridge" ? "pantry" : "fridge";
      await save({ [id]: { label: id === "freezer" ? "Chest freezer" : undefined, size: "c12:4", height: 320 } });
      const hidden = await save({ [id]: { hidden: true, movedTo: target } });
      expect(hidden.status, id).toBe(200);
      expect(await rowOf(id)).toMatchObject({ hidden: true, movedTo: target, size: "c12:4", height: 320 });
      // Nothing in Inventory is written: storage, shelf, use-by dates, all exactly as they were.
      expect(await snapshot()).toEqual(items);
      const back = await save({ [id]: { hidden: false, movedTo: null } });
      expect(back.status, id).toBe(200);
      expect(await rowOf(id)).toMatchObject({ hidden: false, movedTo: null, size: "c12:4", height: 320 });
    }
    expect((await rowOf("freezer")).label).toBe("Chest freezer");
  });

  it("a shelf of the person's own is hidden the same way, and its row and the shelf itself stay", async () => {
    const hidden = await save({ [spices.id]: { hidden: true, movedTo: "pantry" } });
    expect(hidden.status).toBe(200);
    expect(await rowOf(spices.id)).toMatchObject({ hidden: true, movedTo: "pantry" });
    expect(await prisma.pantryLocation.findUnique({ where: { id: spices.id } })).not.toBeNull();
    await save({ [spices.id]: { hidden: false, movedTo: null } });
    expect(await rowOf(spices.id)).toMatchObject({ hidden: false, movedTo: null });
  });

  it("a save that does not list a hidden shelf does not drop it; one from an old tab leaves it hidden", async () => {
    await save({ freezer: { hidden: true, movedTo: "fridge" } });
    // Only two shelves listed, and neither says anything about hiding (an old tab).
    const res = await call("/api/inventory-layout", { method: "PUT", body: { sections: [{ sectionId: "fridge", size: "c12:6" }, { sectionId: "pantry", size: "c12:6" }] } });
    expect(res.status).toBe(200);
    expect(await rowOf("freezer")).toMatchObject({ hidden: true, movedTo: "fridge" });
    // A row that is not hidden and not listed is dropped, as it always was.
    expect(await rowOf(spices.id)).toBeUndefined();
    await save({ freezer: { hidden: false, movedTo: null } });
  });

  it("the last shelf that can hold ingredients cannot be hidden (Leftovers does not count)", async () => {
    await save({ fridge: { hidden: true, movedTo: "pantry" }, freezer: { hidden: true, movedTo: "pantry" }, pantry: { hidden: false } });
    await save({ prepared: { hidden: true, movedTo: "pantry" } });
    const before = await layout();
    // Spices is still showing, so Pantry can go ... but then Spices is the last.
    expect((await save({ pantry: { hidden: true, movedTo: spices.id } })).status).toBe(200);
    const refused = await save({ [spices.id]: { hidden: true, movedTo: null } });
    expect(refused.status).toBe(409);
    expect(refused.data.error || refused.data.message).toBeTruthy();
    expect((await rowOf(spices.id)).hidden).toBe(false);
    // Hiding Leftovers is fine at any time; showing a shelf again works.
    expect((await save({ leftovers: { hidden: true, movedTo: spices.id } })).status).toBe(200);
    expect(before.length).toBeGreaterThan(0);
    for (const id of ["fridge", "freezer", "pantry", "prepared", "leftovers"]) await save({ [id]: { hidden: false, movedTo: null } });
  });

  it("items only go to a shelf that is showing and exists", async () => {
    expect((await save({ freezer: { hidden: true, movedTo: "nowhere" } })).status).toBe(400);
    expect((await save({ freezer: { hidden: true, movedTo: "freezer" } })).status).toBe(400);
    expect((await save({ freezer: { hidden: true, movedTo: "leftovers" } })).status).toBe(400);
    expect((await save({ fridge: { hidden: true, movedTo: "pantry" }, freezer: { hidden: true, movedTo: "fridge" } })).status).toBe(400);
    expect((await rowOf("freezer")).hidden).toBe(false);
    expect((await call("/api/inventory-layout", { method: "PUT", body: { sections: [{ sectionId: "someone-elses-shelf", hidden: true }] } })).status).toBe(400);
  });

  it("nothing is added or removed in Inventory by any of it", async () => {
    const items = await snapshot();
    await save({ freezer: { hidden: true, movedTo: "fridge" } });
    await save({ freezer: { hidden: false, movedTo: null } });
    expect(await snapshot()).toEqual(items);
  });
});

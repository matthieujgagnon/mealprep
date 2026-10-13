import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const { prisma } = await import("./prisma.js");
const { pantryInventoryRouter } = await import("../routes/pantryInventory.js");

// Recently removed, against the real database: every way an item leaves
// Inventory puts it on the list with how it left, Put back restores it as it was
// (same id, shelf, amount, use-by date), the take-out's Undo takes it off the
// list, an add's Undo is not kept, and the entries go with their account.
// Skipped when no database is reachable.
let dbUp = true;
try {
  await prisma.$queryRaw`SELECT 1`;
} catch {
  dbUp = false;
}

describe.skipIf(!dbUp)("Recently removed (database)", () => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
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

  const add = async (data) =>
    (await call("/api/pantry-inventory", { method: "POST", body: { location: "fridge", quantity: 2, unit: "l", expiresAt: "2026-10-20", ...data } })).data;
  const removed = async () => (await call("/api/pantry-inventory/removed")).data;
  const inStock = async () => (await call("/api/pantry-inventory")).data;

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `removed-${stamp}@example.com`, passwordHash: "x" } });
    userId = user.id;
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
    await prisma.user.deleteMany({ where: { id: userId } });
    await new Promise((resolve) => server?.close(resolve));
  });

  it("Used up, Tossed, Deleted, I'm out of this and Cooked each land on the list, newest first, and leave Inventory", async () => {
    const milk = await add({ name: "Milk" });
    const kale = await add({ name: "Kale" });
    const typo = await add({ name: "Mlik" });
    const eggs = await add({ name: "Eggs", quantity: 6, unit: null });
    const rice = await add({ name: "Rice", quantity: 1, unit: "kg", location: "pantry" });

    expect((await call("/api/pantry-inventory/consume", { method: "POST", body: { ids: [milk.id], action: "consumed" } })).status).toBe(204);
    expect((await call("/api/pantry-inventory/consume", { method: "POST", body: { ids: [kale.id], action: "wasted" } })).status).toBe(204);
    expect((await call(`/api/pantry-inventory/${typo.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await call(`/api/pantry-inventory/${eggs.id}?how=consumed`, { method: "DELETE" })).status).toBe(204);
    const cooked = await call("/api/pantry-inventory/take-out", { method: "POST", body: { takes: [{ id: rice.id, amount: "all" }] } });
    expect(cooked.data.removedIds).toEqual([rice.id]);

    const list = await removed();
    expect(list.map((r) => [r.item.name, r.how])).toEqual([
      ["Rice", "cooked"],
      ["Eggs", "consumed"],
      ["Mlik", "deleted"],
      ["Kale", "wasted"],
      ["Milk", "consumed"],
    ]);
    const stock = (await inStock()).map((i) => i.id);
    for (const it of [milk, kale, typo, eggs, rice]) expect(stock).not.toContain(it.id);
  });

  it("Put back restores the same row (id, shelf, amount, use-by date), drops its log line and leaves the list", async () => {
    const butter = await add({ name: "Butter", quantity: 0.25, unit: "lb", location: "freezer", expiresAt: "2026-11-02" });
    await call("/api/pantry-inventory/consume", { method: "POST", body: { ids: [butter.id], action: "wasted" } });
    const entry = (await removed()).find((r) => r.itemId === butter.id);
    expect(entry.logId).toBeUndefined(); // not sent to the page
    const logsBefore = await prisma.pantryConsumptionLog.count({ where: { userId, name: "Butter" } });
    expect(logsBefore).toBe(1);

    const back = await call(`/api/pantry-inventory/removed/${entry.id}/put-back`, { method: "POST" });
    expect(back.status).toBe(200);
    expect(back.data).toMatchObject({ id: butter.id, name: "Butter", quantity: 0.25, unit: "lb", location: "freezer" });
    expect(back.data.expiresAt).toBe(butter.expiresAt);
    expect((await inStock()).some((i) => i.id === butter.id)).toBe(true);
    expect((await removed()).some((r) => r.itemId === butter.id)).toBe(false);
    expect(await prisma.pantryConsumptionLog.count({ where: { userId, name: "Butter" } })).toBe(0);
    // Twice is not found, never a second copy.
    expect((await call(`/api/pantry-inventory/removed/${entry.id}/put-back`, { method: "POST" })).status).toBe(404);
  });

  it("the take-out's Undo (put-back) takes the item off the list again", async () => {
    const flour = await add({ name: "Flour", quantity: 1, unit: "kg", location: "pantry" });
    const done = (await call("/api/pantry-inventory/take-out", { method: "POST", body: { takes: [{ id: flour.id, amount: "all" }] } })).data;
    expect((await removed()).some((r) => r.itemId === flour.id)).toBe(true);
    await call("/api/pantry-inventory/put-back", { method: "POST", body: { rows: done.before, logIds: done.logIds } });
    expect((await removed()).some((r) => r.itemId === flour.id)).toBe(false);
    expect((await inStock()).some((i) => i.id === flour.id)).toBe(true);
  });

  it("an add taken back (?forget=1) is not kept", async () => {
    const oops = await add({ name: "Oops" });
    await call(`/api/pantry-inventory/${oops.id}?forget=1`, { method: "DELETE" });
    expect((await removed()).some((r) => r.itemId === oops.id)).toBe(false);
  });

  it("entries older than 7 Quebec days are deleted for good when the list is read", async () => {
    const old = await add({ name: "Old yogurt" });
    await call(`/api/pantry-inventory/${old.id}`, { method: "DELETE" });
    await prisma.pantryRemovedItem.updateMany({ where: { userId, itemId: old.id }, data: { removedAt: new Date(Date.now() - 9 * 86400000) } });
    expect((await removed()).some((r) => r.itemId === old.id)).toBe(false);
    expect(await prisma.pantryRemovedItem.count({ where: { userId, itemId: old.id } })).toBe(0);
  });

  it("entries are deleted with their account", async () => {
    const other = await prisma.user.create({ data: { email: `removed-other-${stamp}@example.com`, passwordHash: "x" } });
    await prisma.pantryRemovedItem.create({ data: { userId: other.id, itemId: "x", item: { id: "x", name: "Gone" }, how: "deleted" } });
    await prisma.user.delete({ where: { id: other.id } });
    expect(await prisma.pantryRemovedItem.count({ where: { userId: other.id } })).toBe(0);
  });
});

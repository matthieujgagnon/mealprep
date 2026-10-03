import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { fail } from "../lib/i18n.js";

export const groceryCheckedRouter = Router();

// An amount saved on a row (see GroceryCheckedItem.covered / .bought):
// { parts: [{ quantity, unit }], usedIn: [recipe titles] }. Anything else is
// dropped, so the column never holds a shape the list can't read.
function cleanSnapshot(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.parts)) return null;
  const parts = value.parts
    .slice(0, 20)
    .filter((p) => p && typeof p === "object")
    .map((p) => ({
      quantity: typeof p.quantity === "number" && Number.isFinite(p.quantity) ? p.quantity : null,
      unit: typeof p.unit === "string" && p.unit ? p.unit.slice(0, 30) : null,
    }));
  const usedIn = Array.isArray(value.usedIn)
    ? value.usedIn.filter((s) => typeof s === "string").slice(0, 50).map((s) => s.slice(0, 200))
    : [];
  return { parts, usedIn };
}

// Prisma wants DbNull, not null, to clear a Json column.
const toJson = (snapshot) => (snapshot ? snapshot : Prisma.DbNull);

const normalizeCore = (core) => (typeof core === "string" ? core.trim().toLowerCase() : "");

// GET /api/grocery-checked - every row the list has saved: what each check
// covers and what "Done shopping" has bought. One list for all planned
// meals, so no week.
groceryCheckedRouter.get("/", async (req, res) => {
  const rows = await prisma.groceryCheckedItem.findMany({
    where: { userId: req.userId },
    select: { core: true, covered: true, bought: true, inInventory: true },
  });
  res.json(rows);
});

// POST /api/grocery-checked/in-inventory { items: [{ core, bought }] } - the
// one place checked items go to Inventory from. `bought` is the amount now in
// Inventory: it leaves the list, and the check that covered it is cleared.
// A hand-added item (key "extra-<id>") is simply deleted: there is no meal to
// remember it for.
groceryCheckedRouter.post("/in-inventory", async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json(fail(req, "required", { fields: "items" }));
  }
  const ops = [];
  const sent = [];
  for (const item of items) {
    const core = normalizeCore(item?.core);
    if (!core) continue;
    sent.push(core);
    if (core.startsWith("extra-")) {
      const id = item.core.trim().slice("extra-".length);
      ops.push(
        prisma.groceryExtraItem.deleteMany({ where: { id, userId: req.userId } }),
        prisma.groceryCheckedItem.deleteMany({ where: { userId: req.userId, core } }),
        prisma.groceryItemOverride.deleteMany({ where: { userId: req.userId, key: item.core.trim() } })
      );
      continue;
    }
    const bought = cleanSnapshot(item.bought);
    ops.push(
      prisma.groceryCheckedItem.upsert({
        where: { userId_core: { userId: req.userId, core } },
        create: { userId: req.userId, core, bought: toJson(bought) },
        update: { bought: toJson(bought), covered: Prisma.DbNull, inInventory: false },
      })
    );
  }
  await prisma.$transaction(ops);
  res.json(sent);
});

// POST /api/grocery-checked/tidy { set: [{ core, covered, bought }], remove:
// [core] } - the list keeping its saved rows true to the plan: saving the
// amounts on rows from before amounts were saved, trimming amounts that no
// longer fit what the meals need, and dropping rows no planned meal needs.
// It never creates a row.
groceryCheckedRouter.post("/tidy", async (req, res) => {
  const { set = [], remove = [] } = req.body;
  if (!Array.isArray(set) || !Array.isArray(remove)) {
    return res.status(400).json(fail(req, "required", { fields: "set, remove" }));
  }
  const ops = [];
  for (const row of set) {
    const core = normalizeCore(row?.core);
    if (!core) continue;
    ops.push(
      prisma.groceryCheckedItem.updateMany({
        where: { userId: req.userId, core },
        data: { covered: toJson(cleanSnapshot(row.covered)), bought: toJson(cleanSnapshot(row.bought)), inInventory: false },
      })
    );
  }
  const gone = remove.map(normalizeCore).filter(Boolean);
  if (gone.length > 0) {
    ops.push(prisma.groceryCheckedItem.deleteMany({ where: { userId: req.userId, core: { in: gone } } }));
  }
  await prisma.$transaction(ops);
  res.status(204).send();
});

// POST /api/grocery-checked { core, covered } - check an item off, covering
// the amount it shows right now. Checking it again replaces that amount (a
// row whose need grew is checked for the new total).
groceryCheckedRouter.post("/", async (req, res) => {
  const { core, covered } = req.body;
  const normalized = normalizeCore(core);
  if (!normalized) {
    return res.status(400).json(fail(req, "required", { fields: "core" }));
  }
  const snapshot = cleanSnapshot(covered);

  await prisma.groceryCheckedItem.upsert({
    where: { userId_core: { userId: req.userId, core: normalized } },
    create: { userId: req.userId, core: normalized, covered: toJson(snapshot) },
    update: { covered: toJson(snapshot) },
  });
  res.status(201).json({ core: normalized });
});

// Removes the "checked" part of rows. A row that also remembers a purchase
// stays for that; one with nothing left is deleted.
async function uncheck(where) {
  await prisma.$transaction([
    prisma.groceryCheckedItem.updateMany({
      where: { ...where, OR: [{ bought: { not: Prisma.DbNull } }, { inInventory: true }] },
      data: { covered: Prisma.DbNull },
    }),
    prisma.groceryCheckedItem.deleteMany({
      where: { ...where, bought: { equals: Prisma.DbNull }, inInventory: false },
    }),
  ]);
}

// DELETE /api/grocery-checked - clear every check at once. Registered before
// the :core route below so a request with no path segment always lands here.
// What was bought stays bought.
groceryCheckedRouter.delete("/", async (req, res) => {
  await uncheck({ userId: req.userId });
  res.status(204).send();
});

// DELETE /api/grocery-checked/:core - uncheck a single item.
groceryCheckedRouter.delete("/:core", async (req, res) => {
  await uncheck({ userId: req.userId, core: req.params.core.toLowerCase() });
  res.status(204).send();
});

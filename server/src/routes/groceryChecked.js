import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { fail } from "../lib/i18n.js";

export const groceryCheckedRouter = Router();

// GET /api/grocery-checked - which ingredient cores are checked off. Returns
// a plain array of cores (the client just needs the set) rather than the
// full rows. One list for all planned meals, so no week.
groceryCheckedRouter.get("/", async (req, res) => {
  const rows = await prisma.groceryCheckedItem.findMany({
    where: { userId: req.userId },
    select: { core: true },
  });
  res.json(rows.map((r) => r.core));
});

// GET /api/grocery-checked/in-inventory - checked items already added to
// Inventory by "Done shopping".
groceryCheckedRouter.get("/in-inventory", async (req, res) => {
  const rows = await prisma.groceryCheckedItem.findMany({
    where: { userId: req.userId, inInventory: true },
    select: { core: true },
  });
  res.json(rows.map((r) => r.core));
});

// POST /api/grocery-checked/in-inventory { cores } - mark checked items as
// added to Inventory (checking them first if needed).
groceryCheckedRouter.post("/in-inventory", async (req, res) => {
  const { cores } = req.body;
  if (!Array.isArray(cores)) {
    return res.status(400).json(fail(req, "required", { fields: "cores" }));
  }
  const normalized = [...new Set(cores.filter((c) => typeof c === "string" && c.trim()).map((c) => c.trim().toLowerCase()))];
  await prisma.$transaction(
    normalized.map((core) =>
      prisma.groceryCheckedItem.upsert({
        where: { userId_core: { userId: req.userId, core } },
        create: { userId: req.userId, core, inInventory: true },
        update: { inInventory: true },
      })
    )
  );
  res.json(normalized);
});

// POST /api/grocery-checked { core } - check an item off.
// Idempotent: checking the same item twice just no-ops the second time.
groceryCheckedRouter.post("/", async (req, res) => {
  const { core } = req.body;
  if (!core || !core.trim()) {
    return res.status(400).json(fail(req, "required", { fields: "core" }));
  }
  const normalized = core.trim().toLowerCase();

  // Real upsert now that (userId, core) is a DB-level unique constraint -
  // "checked" is just a row's existence, so update is a no-op.
  await prisma.groceryCheckedItem.upsert({
    where: { userId_core: { userId: req.userId, core: normalized } },
    create: { userId: req.userId, core: normalized },
    update: {},
  });
  res.status(201).json({ core: normalized });
});

// DELETE /api/grocery-checked - clear every checked item at once (the
// "Clear checked items" button). Registered before the :core route below so
// a request with no path segment always lands here.
groceryCheckedRouter.delete("/", async (req, res) => {
  await prisma.groceryCheckedItem.deleteMany({ where: { userId: req.userId } });
  res.status(204).send();
});

// DELETE /api/grocery-checked/:core - uncheck a single item.
groceryCheckedRouter.delete("/:core", async (req, res) => {
  const normalized = req.params.core.toLowerCase();
  await prisma.groceryCheckedItem.deleteMany({
    where: { core: normalized, userId: req.userId },
  });
  res.status(204).send();
});

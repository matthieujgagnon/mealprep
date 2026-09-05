import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const groceryCheckedRouter = Router();

// GET /api/grocery-checked?week=YYYY-MM-DD - which ingredient cores are
// checked off for a given week. Returns a plain array of cores (the client
// just needs the set) rather than the full rows.
groceryCheckedRouter.get("/", async (req, res) => {
  const { week } = req.query;
  if (!week) return res.status(400).json({ error: "week is required" });

  const rows = await prisma.groceryCheckedItem.findMany({
    where: { weekStart: week },
    select: { core: true },
  });
  res.json(rows.map((r) => r.core));
});

// POST /api/grocery-checked { weekStart, core } - check an item off.
// Idempotent: checking the same item twice just no-ops the second time.
groceryCheckedRouter.post("/", async (req, res) => {
  const { weekStart, core } = req.body;
  if (!weekStart || !core || !core.trim()) {
    return res.status(400).json({ error: "weekStart and core are required" });
  }
  const normalized = core.trim().toLowerCase();

  await prisma.groceryCheckedItem.upsert({
    where: { weekStart_core: { weekStart, core: normalized } },
    update: {},
    create: { weekStart, core: normalized },
  });
  res.status(201).json({ weekStart, core: normalized });
});

// DELETE /api/grocery-checked?week=YYYY-MM-DD - clear every checked item for
// a week at once (the "Clear checked items" button). Registered before the
// :weekStart/:core route below so a request with no path segments always
// lands here.
groceryCheckedRouter.delete("/", async (req, res) => {
  const { week } = req.query;
  if (!week) return res.status(400).json({ error: "week is required" });

  await prisma.groceryCheckedItem.deleteMany({ where: { weekStart: week } });
  res.status(204).send();
});

// DELETE /api/grocery-checked/:weekStart/:core - uncheck a single item.
groceryCheckedRouter.delete("/:weekStart/:core", async (req, res) => {
  const normalized = req.params.core.toLowerCase();
  await prisma.groceryCheckedItem.deleteMany({
    where: { weekStart: req.params.weekStart, core: normalized },
  });
  res.status(204).send();
});

import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const pantryStaplesRouter = Router();

// GET /api/pantry-staples - list every ingredient the user has marked as a staple
pantryStaplesRouter.get("/", async (req, res) => {
  const staples = await prisma.pantryStaple.findMany({ orderBy: { core: "asc" } });
  res.json(staples);
});

// POST /api/pantry-staples { core } - mark an ingredient as a staple.
// Idempotent: dragging the same ingredient twice just no-ops the second time.
pantryStaplesRouter.post("/", async (req, res) => {
  const { core } = req.body;
  if (!core || !core.trim()) {
    return res.status(400).json({ error: "core is required" });
  }
  const normalized = core.trim().toLowerCase();

  const staple = await prisma.pantryStaple.upsert({
    where: { core: normalized },
    update: {},
    create: { core: normalized },
  });
  res.status(201).json(staple);
});

// PUT /api/pantry-staples/:core { category } - set which staples subsection
// ("Spices" vs "Other staples") an ingredient shows under, overriding the
// automatic detection. Used when a staple is dragged between those two
// subsections on the grocery list.
pantryStaplesRouter.put("/:core", async (req, res) => {
  const { category } = req.body;
  if (category !== "spice" && category !== "other" && category !== null) {
    return res.status(400).json({ error: 'category must be "spice", "other", or null' });
  }
  const normalized = req.params.core.toLowerCase();

  const staple = await prisma.pantryStaple.upsert({
    where: { core: normalized },
    update: { category },
    create: { core: normalized, category },
  });
  res.json(staple);
});

// DELETE /api/pantry-staples/:core - un-mark an ingredient as a staple
pantryStaplesRouter.delete("/:core", async (req, res) => {
  await prisma.pantryStaple.deleteMany({ where: { core: req.params.core.toLowerCase() } });
  res.status(204).send();
});

import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const pantryStaplesRouter = Router();

// GET /api/pantry-staples - list every ingredient the user has marked as a staple
pantryStaplesRouter.get("/", async (req, res) => {
  const staples = await prisma.pantryStaple.findMany({
    where: { userId: req.userId },
    orderBy: { core: "asc" },
  });
  res.json(staples);
});

// (userId, core) isn't a DB-level unique constraint (see schema.prisma's
// @@index comment on PantryStaple), so "one row per user per core" is
// enforced here instead of via Prisma's upsert - find it first, then
// create or update accordingly.
async function upsertStaple(userId, core, data) {
  const existing = await prisma.pantryStaple.findFirst({ where: { userId, core } });
  if (existing) {
    return prisma.pantryStaple.update({ where: { id: existing.id }, data });
  }
  return prisma.pantryStaple.create({ data: { userId, core, ...data } });
}

// POST /api/pantry-staples { core } - mark an ingredient as a staple.
// Idempotent: dragging the same ingredient twice just no-ops the second time.
// Also clears a prior "excluded" override — dragging a previously-removed
// default staple (e.g. salt) back onto the staples section un-removes it.
pantryStaplesRouter.post("/", async (req, res) => {
  const { core } = req.body;
  if (!core || !core.trim()) {
    return res.status(400).json({ error: "core is required" });
  }
  const normalized = core.trim().toLowerCase();
  const staple = await upsertStaple(req.userId, normalized, { excluded: false });
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
  const staple = await upsertStaple(req.userId, normalized, { category });
  res.json(staple);
});

// DELETE /api/pantry-staples/:core - un-mark an ingredient as a staple. For
// one the user added themselves this just reverts it to being a normal
// grocery item. For one of the app's built-in defaults (e.g. "salt", which
// has no row at all until now) it records an explicit exclusion instead of
// deleting nothing — otherwise the built-in list would just put it right
// back on the next render with no way to actually remove it.
pantryStaplesRouter.delete("/:core", async (req, res) => {
  const normalized = req.params.core.toLowerCase();
  await upsertStaple(req.userId, normalized, { excluded: true });
  res.status(204).send();
});

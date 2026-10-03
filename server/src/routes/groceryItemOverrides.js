import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { fail } from "../lib/i18n.js";

export const groceryItemOverridesRouter = Router();

// GET /api/grocery-item-overrides - the removed rows and custom quantities
// (see GroceryItemOverride).
groceryItemOverridesRouter.get("/", async (req, res) => {
  const overrides = await prisma.groceryItemOverride.findMany({
    where: { userId: req.userId },
  });
  res.json(overrides);
});

// PUT /api/grocery-item-overrides { key, quantity?, removed?, hidden? }
// Only the fields sent change. A row left with no custom quantity and not
// removed is deleted, so "reset" and "restore" leave nothing behind.
// Responds with the override, or null once there's nothing left of it.
groceryItemOverridesRouter.put("/", async (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json(fail(req, "required", { fields: "key" }));

  const data = {};
  if ("quantity" in req.body) {
    const q = typeof req.body.quantity === "string" ? req.body.quantity.trim() : "";
    data.quantity = q ? q.slice(0, 60) : null;
  }
  if ("removed" in req.body) data.removed = !!req.body.removed;
  if ("hidden" in req.body) data.hidden = !!req.body.hidden;
  if (data.removed === false) data.hidden = false; // put back = visible again

  const where = { userId_key: { userId: req.userId, key } };
  const saved = await prisma.groceryItemOverride.upsert({
    where,
    create: { userId: req.userId, key, ...data },
    update: data,
  });
  if (!saved.quantity && !saved.removed) {
    await prisma.groceryItemOverride.delete({ where });
    return res.json(null);
  }
  res.json(saved);
});

// POST /api/grocery-item-overrides/clear { keys } - forgets everything saved
// about these rows. The list calls it for rows whose meals have all left the
// plan: a removal lasts only as long as the meals that need the item.
groceryItemOverridesRouter.post("/clear", async (req, res) => {
  const { keys } = req.body;
  if (!Array.isArray(keys)) return res.status(400).json(fail(req, "required", { fields: "keys" }));
  const names = keys.filter((k) => typeof k === "string" && k && !k.startsWith("extra-"));
  await prisma.groceryItemOverride.deleteMany({ where: { userId: req.userId, key: { in: names } } });
  res.status(204).send();
});

import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const groceryItemOverridesRouter = Router();

// GET /api/grocery-item-overrides?week=YYYY-MM-DD - this week's hidden rows
// and custom quantities (see GroceryItemOverride).
groceryItemOverridesRouter.get("/", async (req, res) => {
  const { week } = req.query;
  if (!week) return res.status(400).json({ error: "week is required" });
  const overrides = await prisma.groceryItemOverride.findMany({
    where: { userId: req.userId, weekStart: week },
  });
  res.json(overrides);
});

// PUT /api/grocery-item-overrides { weekStart, key, quantity?, removed?, hidden? }
// Only the fields sent change. A row left with no custom quantity and not
// removed is deleted, so "reset" and "restore" leave nothing behind.
// Responds with the override, or null once there's nothing left of it.
groceryItemOverridesRouter.put("/", async (req, res) => {
  const { weekStart, key } = req.body;
  if (!weekStart || !key) return res.status(400).json({ error: "weekStart and key are required" });

  const data = {};
  if ("quantity" in req.body) {
    const q = typeof req.body.quantity === "string" ? req.body.quantity.trim() : "";
    data.quantity = q ? q.slice(0, 60) : null;
  }
  if ("removed" in req.body) data.removed = !!req.body.removed;
  if ("hidden" in req.body) data.hidden = !!req.body.hidden;
  if (data.removed === false) data.hidden = false; // put back = visible again

  const where = { userId_weekStart_key: { userId: req.userId, weekStart, key } };
  const saved = await prisma.groceryItemOverride.upsert({
    where,
    create: { userId: req.userId, weekStart, key, ...data },
    update: data,
  });
  if (!saved.quantity && !saved.removed) {
    await prisma.groceryItemOverride.delete({ where });
    return res.json(null);
  }
  res.json(saved);
});

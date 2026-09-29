import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const groceryExtraItemsRouter = Router();

// GET /api/grocery-extra-items?week=YYYY-MM-DD - manually-added items for a week.
groceryExtraItemsRouter.get("/", async (req, res) => {
  const { week } = req.query;
  if (!week) return res.status(400).json({ error: "week is required" });

  const items = await prisma.groceryExtraItem.findMany({
    where: { userId: req.userId, weekStart: week },
    orderBy: { createdAt: "asc" },
  });
  res.json(items);
});

// POST /api/grocery-extra-items { weekStart, name, quantity?, unit? }
groceryExtraItemsRouter.post("/", async (req, res) => {
  const { weekStart, name, quantity, unit } = req.body;
  if (!weekStart || !name || !name.trim()) {
    return res.status(400).json({ error: "weekStart and name are required" });
  }
  // Hand-added rows are never merged on the list, so the same name twice in
  // a week (a double-tap, two screens adding the same item) would be two
  // identical rows. Hand back the existing one instead.
  const existing = await prisma.groceryExtraItem.findFirst({
    where: { userId: req.userId, weekStart, name: { equals: name.trim(), mode: "insensitive" } },
  });
  if (existing) {
    const sameUnit = (existing.unit || null) === (unit || null);
    if (typeof quantity === "number" && sameUnit) {
      const merged = await prisma.groceryExtraItem.update({
        where: { id: existing.id },
        data: { quantity: (existing.quantity ?? 0) + quantity },
      });
      return res.json(merged);
    }
    return res.json(existing);
  }
  const item = await prisma.groceryExtraItem.create({
    data: {
      userId: req.userId,
      weekStart,
      name: name.trim(),
      quantity: typeof quantity === "number" ? quantity : null,
      unit: unit || null,
    },
  });
  res.status(201).json(item);
});

// DELETE /api/grocery-extra-items/:id
groceryExtraItemsRouter.delete("/:id", async (req, res) => {
  await prisma.groceryExtraItem.deleteMany({ where: { id: req.params.id, userId: req.userId } });
  res.status(204).send();
});

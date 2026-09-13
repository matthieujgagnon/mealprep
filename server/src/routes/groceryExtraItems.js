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

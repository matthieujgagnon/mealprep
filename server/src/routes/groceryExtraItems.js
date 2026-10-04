import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { fail } from "../lib/i18n.js";

export const groceryExtraItemsRouter = Router();

// GET /api/grocery-extra-items - the manually-added items on the list.
groceryExtraItemsRouter.get("/", async (req, res) => {
  const items = await prisma.groceryExtraItem.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "asc" },
  });
  res.json(items);
});

// POST /api/grocery-extra-items { name, quantity?, unit?, dealId? } - dealId is
// the flyer deal the item was added from.
groceryExtraItemsRouter.post("/", async (req, res) => {
  const { name, quantity, unit, dealId } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json(fail(req, "required", { fields: "name" }));
  }
  // Hand-added rows are never merged on the list, so the same name twice
  // (a double-tap, two screens adding the same item) would be two identical
  // rows. Hand back the existing one instead.
  const existing = await prisma.groceryExtraItem.findFirst({
    where: { userId: req.userId, name: { equals: name.trim(), mode: "insensitive" } },
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
      name: name.trim(),
      quantity: typeof quantity === "number" ? quantity : null,
      unit: unit || null,
      dealId: typeof dealId === "string" && dealId ? dealId : null,
    },
  });
  res.status(201).json(item);
});

// DELETE /api/grocery-extra-items/:id - the item is gone, and so is whatever
// was saved about its row (its check mark, its own amount).
groceryExtraItemsRouter.delete("/:id", async (req, res) => {
  const key = `extra-${req.params.id}`;
  await prisma.$transaction([
    prisma.groceryExtraItem.deleteMany({ where: { id: req.params.id, userId: req.userId } }),
    prisma.groceryCheckedItem.deleteMany({ where: { userId: req.userId, core: key } }),
    prisma.groceryItemOverride.deleteMany({ where: { userId: req.userId, key } }),
  ]);
  res.status(204).send();
});

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

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;

// POST /api/grocery-extra-items/push { fromWeek, toWeek, key, name,
// quantity?, unit?, quantityText? } - "→ Next week": the row is added to
// the other week's list by hand and marked moved on this one (an override
// with movedTo), so it can be pulled back. quantityText keeps the row's own
// amount ("2 cans") when it isn't one number and unit.
groceryExtraItemsRouter.post("/push", async (req, res) => {
  const { fromWeek, toWeek, key, name, quantity, unit, quantityText } = req.body || {};
  if (!WEEK_RE.test(fromWeek || "") || !WEEK_RE.test(toWeek || "") || !key || fromWeek === toWeek || !name || !String(name).trim()) {
    return res.status(400).json({ error: "fromWeek, toWeek, key and name are required" });
  }
  const userId = req.userId;
  const existing = await prisma.groceryExtraItem.findFirst({
    where: { userId, weekStart: toWeek, name: { equals: String(name).trim(), mode: "insensitive" } },
  });
  const item =
    existing ||
    (await prisma.groceryExtraItem.create({
      data: {
        userId,
        weekStart: toWeek,
        name: String(name).trim(),
        quantity: typeof quantity === "number" ? quantity : null,
        unit: unit || null,
        pushedFrom: fromWeek,
        pushedKey: key,
      },
    }));
  if (!existing && typeof quantityText === "string" && quantityText.trim()) {
    const extraKey = `extra-${item.id}`;
    const q = quantityText.trim().slice(0, 60);
    await prisma.groceryItemOverride.upsert({
      where: { userId_weekStart_key: { userId, weekStart: toWeek, key: extraKey } },
      create: { userId, weekStart: toWeek, key: extraKey, quantity: q },
      update: { quantity: q },
    });
  }
  const override = await prisma.groceryItemOverride.upsert({
    where: { userId_weekStart_key: { userId, weekStart: fromWeek, key } },
    create: { userId, weekStart: fromWeek, key, removed: true, hidden: false, movedTo: toWeek },
    update: { removed: true, hidden: false, movedTo: toWeek },
  });
  res.json({ item, override });
});

// POST /api/grocery-extra-items/pull-back { fromWeek, key } - undoes a
// push: the row is back on fromWeek's list and off the other week's.
groceryExtraItemsRouter.post("/pull-back", async (req, res) => {
  const { fromWeek, key } = req.body || {};
  if (!WEEK_RE.test(fromWeek || "") || !key) return res.status(400).json({ error: "fromWeek and key are required" });
  const userId = req.userId;
  const pushed = await prisma.groceryExtraItem.findMany({ where: { userId, pushedFrom: fromWeek, pushedKey: key } });
  await prisma.$transaction([
    ...pushed.map((extra) =>
      prisma.groceryItemOverride.deleteMany({ where: { userId, weekStart: extra.weekStart, key: `extra-${extra.id}` } })
    ),
    prisma.groceryExtraItem.deleteMany({ where: { userId, id: { in: pushed.map((e) => e.id) } } }),
    prisma.groceryItemOverride.deleteMany({ where: { userId, weekStart: fromWeek, key, quantity: null } }),
    prisma.groceryItemOverride.updateMany({ where: { userId, weekStart: fromWeek, key }, data: { removed: false, hidden: false, movedTo: null } }),
  ]);
  res.status(204).send();
});

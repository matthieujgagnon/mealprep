import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { suggestExpiration, suggestCategory, CATEGORIES } from "../lib/foodkeeper.js";

export const pantryInventoryRouter = Router();

const LOCATIONS = ["pantry", "fridge", "freezer"];

// GET /api/pantry-inventory - every item currently in stock, soonest-expiring first.
pantryInventoryRouter.get("/", async (req, res) => {
  const items = await prisma.pantryInventoryItem.findMany({
    where: { userId: req.userId },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
  });
  res.json(items);
});

// GET /api/pantry-inventory/suggest?name=...&location=...&purchasedAt=... - a
// live preview of the suggested expiration date and category, so the Add
// form can show them before the item is actually saved (and so it can
// re-suggest if the user changes the location after typing a name).
pantryInventoryRouter.get("/suggest", async (req, res) => {
  const { name, location } = req.query;
  if (!name || !name.trim()) return res.status(400).json({ error: "name is required" });
  if (!LOCATIONS.includes(location)) {
    return res.status(400).json({ error: `location must be one of: ${LOCATIONS.join(", ")}` });
  }
  const purchasedAt = req.query.purchasedAt ? new Date(req.query.purchasedAt) : new Date();
  const expiresAt = suggestExpiration(name, location, purchasedAt);
  const category = suggestCategory(name);
  res.json({ expiresAt, category });
});

// POST /api/pantry-inventory { name, quantity?, unit?, location?, category?, purchasedAt?, expiresAt? }
// If expiresAt/category aren't given, they're suggested from the bundled
// USDA data - still just a starting point, edited later via PUT like any
// other field. `core` is derived from `name` rather than taken from the
// client - nothing here needs the fuller ingredient-parser canonicalization
// the grocery list uses.
pantryInventoryRouter.post("/", async (req, res) => {
  const { name, quantity, unit, expiresAt, category } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "name is required" });
  if (category !== undefined && !CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(", ")}` });
  }

  const location = LOCATIONS.includes(req.body.location) ? req.body.location : "fridge";
  const purchasedAt = req.body.purchasedAt ? new Date(req.body.purchasedAt) : new Date();
  const resolvedExpiresAt =
    expiresAt !== undefined ? (expiresAt ? new Date(expiresAt) : null) : suggestExpiration(name, location, purchasedAt);
  const resolvedCategory = category || suggestCategory(name);

  const item = await prisma.pantryInventoryItem.create({
    data: {
      userId: req.userId,
      name: name.trim(),
      core: name.trim().toLowerCase(),
      category: resolvedCategory,
      quantity: typeof quantity === "number" ? quantity : null,
      unit: unit || null,
      location,
      purchasedAt,
      expiresAt: resolvedExpiresAt,
    },
  });
  res.status(201).json(item);
});

// PUT /api/pantry-inventory/:id { quantity?, unit?, location?, category?, purchasedAt?, expiresAt? } -
// edits any field, most commonly the suggested expiration date itself.
pantryInventoryRouter.put("/:id", async (req, res) => {
  const data = {};
  if (req.body.quantity !== undefined) data.quantity = typeof req.body.quantity === "number" ? req.body.quantity : null;
  if (req.body.unit !== undefined) data.unit = req.body.unit || null;
  if (req.body.location !== undefined) {
    if (!LOCATIONS.includes(req.body.location)) {
      return res.status(400).json({ error: `location must be one of: ${LOCATIONS.join(", ")}` });
    }
    data.location = req.body.location;
  }
  if (req.body.category !== undefined) {
    if (!CATEGORIES.includes(req.body.category)) {
      return res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(", ")}` });
    }
    data.category = req.body.category;
  }
  if (req.body.purchasedAt !== undefined) data.purchasedAt = new Date(req.body.purchasedAt);
  if (req.body.expiresAt !== undefined) data.expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;

  const result = await prisma.pantryInventoryItem.updateMany({
    where: { id: req.params.id, userId: req.userId },
    data,
  });
  if (result.count === 0) return res.status(404).json({ error: "Item not found" });
  const item = await prisma.pantryInventoryItem.findFirst({ where: { id: req.params.id, userId: req.userId } });
  res.json(item);
});

// DELETE /api/pantry-inventory { ids: [...] } - bulk remove, for multi-select.
// Registered before /:id so an exact match on the router path ("/") wins;
// Express matches routes in registration order.
pantryInventoryRouter.delete("/", async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids must be a non-empty array" });
  }
  await prisma.pantryInventoryItem.deleteMany({ where: { id: { in: ids }, userId: req.userId } });
  res.status(204).send();
});

// DELETE /api/pantry-inventory/:id - single-item remove.
pantryInventoryRouter.delete("/:id", async (req, res) => {
  await prisma.pantryInventoryItem.deleteMany({ where: { id: req.params.id, userId: req.userId } });
  res.status(204).send();
});

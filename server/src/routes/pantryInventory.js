import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { suggestExpiration } from "../lib/foodkeeper.js";

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
// live preview of the suggested expiration date, so the Add form can show it
// before the item is actually saved (and so it can re-suggest if the user
// changes the location after typing a name).
pantryInventoryRouter.get("/suggest", async (req, res) => {
  const { name, location } = req.query;
  if (!name || !name.trim()) return res.status(400).json({ error: "name is required" });
  if (!LOCATIONS.includes(location)) {
    return res.status(400).json({ error: `location must be one of: ${LOCATIONS.join(", ")}` });
  }
  const purchasedAt = req.query.purchasedAt ? new Date(req.query.purchasedAt) : new Date();
  const expiresAt = suggestExpiration(name, location, purchasedAt);
  res.json({ expiresAt });
});

// POST /api/pantry-inventory { name, quantity?, unit?, location?, purchasedAt?, expiresAt? }
// If expiresAt isn't given, it's suggested from the bundled USDA data - still
// just a starting point, edited later via PUT like any other field. `core`
// is derived from `name` rather than taken from the client - nothing here
// needs the fuller ingredient-parser canonicalization the grocery list uses.
pantryInventoryRouter.post("/", async (req, res) => {
  const { name, quantity, unit, expiresAt } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "name is required" });

  const location = LOCATIONS.includes(req.body.location) ? req.body.location : "fridge";
  const purchasedAt = req.body.purchasedAt ? new Date(req.body.purchasedAt) : new Date();
  const resolvedExpiresAt =
    expiresAt !== undefined ? (expiresAt ? new Date(expiresAt) : null) : suggestExpiration(name, location, purchasedAt);

  const item = await prisma.pantryInventoryItem.create({
    data: {
      userId: req.userId,
      name: name.trim(),
      core: name.trim().toLowerCase(),
      quantity: typeof quantity === "number" ? quantity : null,
      unit: unit || null,
      location,
      purchasedAt,
      expiresAt: resolvedExpiresAt,
    },
  });
  res.status(201).json(item);
});

// PUT /api/pantry-inventory/:id { quantity?, unit?, location?, purchasedAt?, expiresAt? } -
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

// DELETE /api/pantry-inventory/:id
pantryInventoryRouter.delete("/:id", async (req, res) => {
  await prisma.pantryInventoryItem.deleteMany({ where: { id: req.params.id, userId: req.userId } });
  res.status(204).send();
});

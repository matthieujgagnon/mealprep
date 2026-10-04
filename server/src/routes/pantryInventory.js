import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { suggestExpiration, suggestAllLocations, suggestCategory, suggestLocation, CATEGORIES } from "../lib/foodkeeper.js";
import { fail } from "../lib/i18n.js";

export const pantryInventoryRouter = Router();

const LOCATIONS = ["pantry", "fridge", "freezer"];

// Adds `locations` (the USDA range for every storage spot, keyed by
// location - null where the matched product has no data for that spot) and
// `shelfLifeDays` (that same range's day count for the item's *current*
// location) - both computed fresh from the bundled FoodKeeper data on every
// read rather than stored, same as suggestCategory/suggestExpiration
// already are elsewhere in this file. The Inventory page uses `locations`
// to render the storage picker's per-location day ranges without a lookup
// per item, and `shelfLifeDays` as the freshness bar's denominator - used
// by every route below that returns an item, not just the list, so a
// freshly added or edited item has these fields immediately rather than
// only after the next full reload.
function enrichItem(item) {
  const locations = suggestAllLocations(item.name, item.purchasedAt);
  return { ...item, locations, shelfLifeDays: locations[item.location]?.defaultDays ?? null };
}

// A built-in location (fridge/pantry/freezer) or one of the user's own
// custom PantryLocation ids (see routes/pantryLocations.js). Returns null
// when `location` is neither, so callers can tell "not given" from
// "invalid" apart.
async function resolveLocation(userId, location) {
  if (LOCATIONS.includes(location)) return location;
  const custom = await prisma.pantryLocation.findFirst({ where: { id: location, userId } });
  return custom ? location : null;
}

// GET /api/pantry-inventory - every item currently in stock, soonest-expiring first.
pantryInventoryRouter.get("/", async (req, res) => {
  const items = await prisma.pantryInventoryItem.findMany({
    where: { userId: req.userId },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
  });
  res.json(items.map(enrichItem));
});

// GET /api/pantry-inventory/suggest?name=...&location=...&purchasedAt=... - a
// live preview of the suggested expiration date, category and (when no
// location is given) shelf, so the Add form and the confirmation sheet can
// show them before the item is actually saved (and re-suggest if the user
// changes the location after typing a name).
pantryInventoryRouter.get("/suggest", async (req, res) => {
  const { name } = req.query;
  if (!name || !name.trim()) return res.status(400).json(fail(req, "required", { fields: "name" }));
  // No location given: suggest one too (the confirmation sheet asks for a
  // shelf for every item it's about to add).
  const location = req.query.location ? await resolveLocation(req.userId, req.query.location) : suggestLocation(name);
  if (!location) {
    return res.status(400).json(fail(req, "mustBeOneOf", { field: "location", options: LOCATIONS.join(", ") }));
  }
  const purchasedAt = req.query.purchasedAt ? new Date(req.query.purchasedAt) : new Date();
  // A shelf of your own keeps things like the pantry does.
  const expiresAt = suggestExpiration(name, LOCATIONS.includes(location) ? location : "pantry", purchasedAt);
  const category = suggestCategory(name);
  res.json({ expiresAt, category, location });
});

// An item's photo: one uploaded through /api/recipe-images, a web link, or
// "none" (no picture, not even the generic one the client would pick).
// undefined = not given; null = no photo of its own; false = not a photo.
function photoUrl(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const url = String(value).trim();
  if (url === "none") return url;
  if (url.length > 2000) return false;
  return /^\/api\/recipe-images\/[\w-]+$/.test(url) || /^https?:\/\/\S+$/i.test(url) ? url : false;
}

// POST /api/pantry-inventory { name, quantity?, unit?, location?, category?, purchasedAt?, expiresAt?, imageUrl? }
// If expiresAt/category aren't given, they're suggested from the bundled
// USDA data - still just a starting point, edited later via PUT like any
// other field. `core` is derived from `name` rather than taken from the
// client - nothing here needs the fuller ingredient-parser canonicalization
// the grocery list uses.
pantryInventoryRouter.post("/", async (req, res) => {
  const { name, quantity, unit, expiresAt, category } = req.body;
  if (!name || !name.trim()) return res.status(400).json(fail(req, "required", { fields: "name" }));
  if (category !== undefined && !CATEGORIES.includes(category)) {
    return res.status(400).json(fail(req, "mustBeOneOf", { field: "category", options: CATEGORIES.join(", ") }));
  }
  const imageUrl = photoUrl(req.body.imageUrl);
  if (imageUrl === false) return res.status(400).json(fail(req, "imageUrlInvalid"));

  const location = (await resolveLocation(req.userId, req.body.location)) || suggestLocation(name);
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
      imageUrl: imageUrl ?? null,
    },
  });
  res.status(201).json(enrichItem(item));
});

// PUT /api/pantry-inventory/:id { name?, quantity?, unit?, location?, category?, purchasedAt?, expiresAt?, imageUrl? } -
// edits any field, most commonly the suggested expiration date itself.
pantryInventoryRouter.put("/:id", async (req, res) => {
  const data = {};
  if (req.body.name !== undefined) {
    if (!req.body.name.trim()) return res.status(400).json(fail(req, "nameEmpty"));
    data.name = req.body.name.trim();
    data.core = req.body.name.trim().toLowerCase();
  }
  if (req.body.quantity !== undefined) data.quantity = typeof req.body.quantity === "number" ? req.body.quantity : null;
  if (req.body.unit !== undefined) data.unit = req.body.unit || null;
  if (req.body.location !== undefined) {
    const resolved = await resolveLocation(req.userId, req.body.location);
    if (!resolved) {
      return res.status(400).json(fail(req, "locationInvalid"));
    }
    data.location = resolved;
  }
  if (req.body.category !== undefined) {
    if (!CATEGORIES.includes(req.body.category)) {
      return res.status(400).json(fail(req, "mustBeOneOf", { field: "category", options: CATEGORIES.join(", ") }));
    }
    data.category = req.body.category;
  }
  if (req.body.purchasedAt !== undefined) data.purchasedAt = new Date(req.body.purchasedAt);
  if (req.body.expiresAt !== undefined) data.expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
  if (req.body.imageUrl !== undefined) {
    const imageUrl = photoUrl(req.body.imageUrl);
    if (imageUrl === false) return res.status(400).json(fail(req, "imageUrlInvalid"));
    data.imageUrl = imageUrl;
  }

  const result = await prisma.pantryInventoryItem.updateMany({
    where: { id: req.params.id, userId: req.userId },
    data,
  });
  if (result.count === 0) return res.status(404).json(fail(req, "notFound.item"));
  const item = await prisma.pantryInventoryItem.findFirst({ where: { id: req.params.id, userId: req.userId } });
  res.json(enrichItem(item));
});

// POST /api/pantry-inventory/consume { ids: [...], action: "consumed" | "wasted" } -
// the Inventory page's "Used up"/"Tossed" bulk actions: removes the items
// (same as a plain delete) but first snapshots each into
// PantryConsumptionLog, since the item row itself won't exist to look back
// at afterward. Registered before /:id for the same route-ordering reason
// as the bulk DELETE below.
pantryInventoryRouter.post("/consume", async (req, res) => {
  const { ids, action } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json(fail(req, "mustBeArray", { field: "ids" }));
  }
  if (action !== "consumed" && action !== "wasted") {
    return res.status(400).json(fail(req, "consumeAction"));
  }

  const items = await prisma.pantryInventoryItem.findMany({
    where: { id: { in: ids }, userId: req.userId },
  });
  if (items.length === 0) return res.status(404).json(fail(req, "notFound.items"));

  await prisma.$transaction([
    prisma.pantryConsumptionLog.createMany({
      data: items.map((item) => ({
        userId: req.userId,
        name: item.name,
        core: item.core,
        category: item.category,
        action,
      })),
    }),
    prisma.pantryInventoryItem.deleteMany({
      where: { id: { in: items.map((i) => i.id) }, userId: req.userId },
    }),
  ]);

  res.status(204).send();
});

// DELETE /api/pantry-inventory/:id - single-item remove.
pantryInventoryRouter.delete("/:id", async (req, res) => {
  await prisma.pantryInventoryItem.deleteMany({ where: { id: req.params.id, userId: req.userId } });
  res.status(204).send();
});

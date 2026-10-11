import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { suggestExpiration, suggestAllLocations, suggestCategory, suggestLocation, CATEGORIES } from "../lib/foodkeeper.js";
import { fail } from "../lib/i18n.js";
import { mergeRecent } from "../lib/recentItems.js";
import { planTakeOut, portionsDue, validTakes } from "../lib/inventoryTakeOut.js";
import { upcomingWhere } from "../lib/upcomingMeals.js";

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
// Leftovers keep for the time they were given when saved or moved to the fridge
// (the recipe's own fridge life, or the freezer's), so that is their bar.
function enrichItem(item) {
  const locations = suggestAllLocations(item.name, item.purchasedAt);
  const kept =
    item.isLeftover && item.expiresAt
      ? Math.max(1, Math.round((new Date(item.expiresAt) - new Date(item.purchasedAt)) / 86400000))
      : null;
  return { ...item, locations, shelfLifeDays: kept ?? locations[item.location]?.defaultDays ?? null };
}

// A leftover's recipe must be one of this user's own. undefined = not given;
// null = none; false = not theirs.
async function leftoverRecipeId(userId, value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const recipe = await prisma.recipe.findFirst({ where: { id: String(value), userId }, select: { id: true } });
  return recipe ? recipe.id : false;
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
  // The shelf life for every shelf too (null where there's no data for a shelf), so the
  // Add item form can show its shelf cards before anything is saved.
  res.json({ expiresAt, category, location, locations: suggestAllLocations(name, purchasedAt) });
});

// GET /api/pantry-inventory/recent - the foods the Add item form offers as
// "Recent" chips: the last few distinct names you added or used up. Registered
// before /:id so "recent" isn't read as an item id.
pantryInventoryRouter.get("/recent", async (req, res) => {
  const [items, logs] = await Promise.all([
    prisma.pantryInventoryItem.findMany({ where: { userId: req.userId }, orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.pantryConsumptionLog.findMany({ where: { userId: req.userId }, orderBy: { createdAt: "desc" }, take: 40 }),
  ]);
  res.json(mergeRecent(items, logs));
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
  const { name, quantity, unit, expiresAt, category, isLeftover } = req.body;
  if (!name || !name.trim()) return res.status(400).json(fail(req, "required", { fields: "name" }));
  if (category !== undefined && !CATEGORIES.includes(category)) {
    return res.status(400).json(fail(req, "mustBeOneOf", { field: "category", options: CATEGORIES.join(", ") }));
  }
  const imageUrl = photoUrl(req.body.imageUrl);
  if (imageUrl === false) return res.status(400).json(fail(req, "imageUrlInvalid"));
  const recipeId = await leftoverRecipeId(req.userId, req.body.recipeId);
  if (recipeId === false) return res.status(404).json(fail(req, "notFound.recipe"));

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
      isLeftover: isLeftover === true,
      recipeId: recipeId ?? null,
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
  if (req.body.isLeftover !== undefined) data.isLeftover = req.body.isLeftover === true;
  if (req.body.recipeId !== undefined) {
    const recipeId = await leftoverRecipeId(req.userId, req.body.recipeId);
    if (recipeId === false) return res.status(404).json(fail(req, "notFound.recipe"));
    data.recipeId = recipeId;
  }

  const result = await prisma.pantryInventoryItem.updateMany({
    where: { id: req.params.id, userId: req.userId },
    data,
  });
  if (result.count === 0) return res.status(404).json(fail(req, "notFound.item"));
  const item = await prisma.pantryInventoryItem.findFirst({ where: { id: req.params.id, userId: req.userId } });
  res.json(enrichItem(item));
});

// Takes amounts out of the user's items in one go (lib/inventoryTakeOut.js):
// lowers what is left, and logs then removes what reaches zero, as "Used up"
// does. Resolves with what Undo needs: `before` (every changed row exactly as
// it was), `removedIds`, `logIds` (the log lines written for them) and the
// changed items as they are now (`items`).
async function takeOut(userId, takes) {
  const items = await prisma.pantryInventoryItem.findMany({
    where: { id: { in: [...new Set(takes.map((t) => t.id))] }, userId },
  });
  const { updates, removes } = planTakeOut(items, takes);
  const touched = new Set([...removes, ...updates.map((u) => u.id)]);
  const removed = items.filter((i) => removes.includes(i.id));
  const logIds = [];
  await prisma.$transaction(async (tx) => {
    for (const item of removed) {
      const log = await tx.pantryConsumptionLog.create({
        data: { userId, name: item.name, core: item.core, category: item.category, action: "consumed" },
      });
      logIds.push(log.id);
    }
    for (const { id, quantity } of updates) await tx.pantryInventoryItem.update({ where: { id }, data: { quantity } });
    if (removes.length > 0) await tx.pantryInventoryItem.deleteMany({ where: { id: { in: removes }, userId } });
  });
  const after = new Map(updates.map((u) => [u.id, u.quantity]));
  return {
    before: items.filter((i) => touched.has(i.id)),
    removedIds: removes,
    logIds,
    items: items.filter((i) => after.has(i.id)).map((i) => enrichItem({ ...i, quantity: after.get(i.id) })),
  };
}

// POST /api/pantry-inventory/take-out { takes: [{ id, amount }] } - "Remove from
// inventory" on the finished view: each amount is in the item's own unit, or
// "all". Responds as takeOut() above.
pantryInventoryRouter.post("/take-out", async (req, res) => {
  if (!validTakes(req.body.takes)) return res.status(400).json(fail(req, "takeOutAmounts"));
  res.json(await takeOut(req.userId, req.body.takes));
});

// POST /api/pantry-inventory/put-back { rows, logIds? } - Undo for a take-out:
// puts each row back exactly as it was (same id, amount, shelf, dates, photo),
// whether it was lowered or removed, and drops the "used up" log lines the
// take-out wrote. This only undoes; it is not a way of adding new things.
pantryInventoryRouter.post("/put-back", async (req, res) => {
  const { rows, logIds } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json(fail(req, "mustBeArray", { field: "rows" }));
  const restored = [];
  for (const row of rows) {
    if (!row || typeof row.id !== "string" || !String(row.name || "").trim()) continue;
    const existing = await prisma.pantryInventoryItem.findUnique({ where: { id: row.id } });
    if (existing && existing.userId !== req.userId) continue;
    const imageUrl = photoUrl(row.imageUrl);
    const recipeId = await leftoverRecipeId(req.userId, row.recipeId ?? null);
    const data = {
      name: String(row.name).trim(),
      core: String(row.name).trim().toLowerCase(),
      category: CATEGORIES.includes(row.category) ? row.category : "other",
      quantity: typeof row.quantity === "number" ? row.quantity : null,
      unit: row.unit || null,
      location: (await resolveLocation(req.userId, row.location)) || "pantry",
      purchasedAt: row.purchasedAt ? new Date(row.purchasedAt) : new Date(),
      expiresAt: row.expiresAt ? new Date(row.expiresAt) : null,
      imageUrl: imageUrl === false ? null : imageUrl ?? null,
      isLeftover: row.isLeftover === true,
      recipeId: recipeId || null,
    };
    const item = existing
      ? await prisma.pantryInventoryItem.update({ where: { id: row.id }, data })
      : await prisma.pantryInventoryItem.create({
          data: { ...data, id: row.id, userId: req.userId, ...(row.createdAt && { createdAt: new Date(row.createdAt) }) },
        });
    restored.push(enrichItem(item));
  }
  if (Array.isArray(logIds) && logIds.length > 0) {
    await prisma.pantryConsumptionLog.deleteMany({ where: { id: { in: logIds.map(String) }, userId: req.userId } });
  }
  res.json(restored);
});

// POST /api/pantry-inventory/leftovers/settle { today: "YYYY-MM-DD" } - each
// planned leftover meal (linked to Inventory leftovers) whose day is before
// `today` takes one portion off those leftovers, once: the meal is marked with
// `cookedAt`. Leftovers at zero portions leave Inventory. Responds as takeOut()
// plus `entryIds` (the meals marked) and `meals` ([{ title, count }]) for the
// message; Undo is put-back plus clearing `cookedAt` on those meals.
pantryInventoryRouter.post("/leftovers/settle", async (req, res) => {
  const upcoming = upcomingWhere(req.body.today);
  if (!upcoming) return res.status(400).json(fail(req, "required", { fields: "today (YYYY-MM-DD)" }));
  const entries = await prisma.plannerEntry.findMany({
    where: { userId: req.userId, isLeftover: true, leftoverItemId: { not: null }, cookedAt: null, NOT: upcoming },
    include: { recipe: { select: { title: true } } },
  });
  if (entries.length === 0) return res.json({ entryIds: [], meals: [], before: [], removedIds: [], logIds: [], items: [] });
  const takes = portionsDue(entries);
  const result = await takeOut(req.userId, takes);
  const entryIds = entries.map((e) => e.id);
  await prisma.plannerEntry.updateMany({ where: { id: { in: entryIds }, userId: req.userId }, data: { cookedAt: new Date() } });
  const counts = new Map();
  for (const e of entries) counts.set(e.recipe.title, (counts.get(e.recipe.title) || 0) + 1);
  res.json({ ...result, entryIds, meals: [...counts].map(([title, count]) => ({ title, count })) });
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

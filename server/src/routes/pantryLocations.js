import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { fail } from "../lib/i18n.js";
import { isBuiltInName, normalizeName } from "../lib/shelves.js";
import { suggestLocation } from "../lib/foodkeeper.js";

export const pantryLocationsRouter = Router();

// A new or renamed section may not have the name of a built-in shelf (Fridge, Freezer, Pantry,
// Leftovers, Prepared meals: in either language, or the name the person gave one), so there are
// never two shelves with the same name. This is only asked of a new name: a section that already
// shares a name (the old « Prepared meals » that was merged into the built-in one, until it is
// deleted) keeps working.
async function takenByBuiltIn(userId, name) {
  const layout = await prisma.inventorySectionLayout.findMany({ where: { userId }, select: { sectionId: true, label: true } });
  return isBuiltInName(name, layout);
}

// GET /api/pantry-locations - the user's custom storage sections, beyond
// the built-in shelves (Fridge, Freezer, Pantry, Leftovers and Prepared meals, which aren't
// stored rows: an item says which shelf it is on with PantryInventoryItem.shelf, and where
// it is kept with .location).
pantryLocationsRouter.get("/", async (req, res) => {
  const locations = await prisma.pantryLocation.findMany({
    where: { userId: req.userId },
    orderBy: { position: "asc" },
  });
  res.json(locations);
});

// POST /api/pantry-locations { name } - add a new custom section.
pantryLocationsRouter.post("/", async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json(fail(req, "required", { fields: "name" }));
  }
  const trimmedName = name.trim();
  if (await takenByBuiltIn(req.userId, trimmedName)) return res.status(409).json(fail(req, "sectionExists", { name: trimmedName }));
  const count = await prisma.pantryLocation.count({ where: { userId: req.userId } });
  try {
    const location = await prisma.pantryLocation.create({
      data: { userId: req.userId, name: trimmedName, position: count },
    });
    res.status(201).json(location);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json(fail(req, "sectionExists", { name: trimmedName }));
    }
    throw err;
  }
});

// PUT /api/pantry-locations/:id { name } - rename a custom section.
pantryLocationsRouter.put("/:id", async (req, res) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  if (!name) return res.status(400).json(fail(req, "required", { fields: "name" }));
  const existing = await prisma.pantryLocation.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json(fail(req, "notFound.section"));
  if (normalizeName(name) !== normalizeName(existing.name) && (await takenByBuiltIn(req.userId, name))) {
    return res.status(409).json(fail(req, "sectionExists", { name }));
  }
  try {
    const location = await prisma.pantryLocation.update({ where: { id: existing.id }, data: { name } });
    res.json(location);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json(fail(req, "sectionExists", { name }));
    }
    throw err;
  }
});

// DELETE /api/pantry-locations/:id - removes a custom section. Items still on it go back to their
// default shelf (the one for where they are kept, « Plats préparés » for a prepared meal): only
// their `shelf` is cleared, so where they are kept is never lost. An item whose storage was not
// known yet (its `location` is still this section, see lib/shelves.js) gets the storage guessed
// from its name, as the confirmation list would.
pantryLocationsRouter.delete("/:id", async (req, res) => {
  const stranded = await prisma.pantryInventoryItem.findMany({
    where: { userId: req.userId, location: req.params.id },
    select: { id: true, name: true },
  });
  await prisma.$transaction([
    prisma.pantryInventoryItem.updateMany({
      where: { userId: req.userId, shelf: req.params.id },
      data: { shelf: null },
    }),
    ...stranded.map((item) =>
      prisma.pantryInventoryItem.update({ where: { id: item.id }, data: { location: suggestLocation(item.name) } })
    ),
    prisma.pantryLocation.deleteMany({ where: { id: req.params.id, userId: req.userId } }),
  ]);
  res.status(204).send();
});

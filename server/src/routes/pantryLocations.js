import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const pantryLocationsRouter = Router();

// GET /api/pantry-locations - the user's custom storage sections, beyond
// the three built-in ones (Fridge/Pantry/Freezer, which aren't stored rows
// - see PantryInventoryItem.location).
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
    return res.status(400).json({ error: "name is required" });
  }
  const trimmedName = name.trim();
  const count = await prisma.pantryLocation.count({ where: { userId: req.userId } });
  try {
    const location = await prisma.pantryLocation.create({
      data: { userId: req.userId, name: trimmedName, position: count },
    });
    res.status(201).json(location);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: `A section named "${trimmedName}" already exists` });
    }
    throw err;
  }
});

// DELETE /api/pantry-locations/:id - removes a custom section. Any items
// still placed in it move back to Pantry rather than being left pointing
// at a location that no longer exists.
pantryLocationsRouter.delete("/:id", async (req, res) => {
  await prisma.$transaction([
    prisma.pantryInventoryItem.updateMany({
      where: { userId: req.userId, location: req.params.id },
      data: { location: "pantry" },
    }),
    prisma.pantryLocation.deleteMany({ where: { id: req.params.id, userId: req.userId } }),
  ]);
  res.status(204).send();
});

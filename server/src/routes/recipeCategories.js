import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const recipeCategoriesRouter = Router();

// GET /api/recipe-categories - list all cookbook categories
recipeCategoriesRouter.get("/", async (req, res) => {
  const categories = await prisma.recipeCategory.findMany({
    where: { userId: req.userId },
    orderBy: { position: "asc" },
  });
  res.json(categories);
});

// POST /api/recipe-categories { name } - create a new empty category
recipeCategoriesRouter.post("/", async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  const count = await prisma.recipeCategory.count({ where: { userId: req.userId } });
  const category = await prisma.recipeCategory.create({
    data: { userId: req.userId, name: name.trim(), position: count },
  });
  res.status(201).json(category);
});

// PUT /api/recipe-categories/reorder { orderedIds: [id1, id2, ...] } - sets
// each category's position to its index in the given order
recipeCategoriesRouter.put("/reorder", async (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ error: "orderedIds[] is required" });
  }
  await prisma.$transaction(
    orderedIds.map((id, position) =>
      prisma.recipeCategory.updateMany({ where: { id, userId: req.userId }, data: { position } })
    )
  );
  res.status(204).send();
});

// DELETE /api/recipe-categories/:id - remove a category (its recipes become
// uncategorized, via the onDelete: SetNull relation — not deleted)
recipeCategoriesRouter.delete("/:id", async (req, res) => {
  await prisma.recipeCategory.deleteMany({ where: { id: req.params.id, userId: req.userId } });
  res.status(204).send();
});

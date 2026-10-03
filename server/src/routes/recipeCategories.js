import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { fail } from "../lib/i18n.js";

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
    return res.status(400).json(fail(req, "required", { fields: "name" }));
  }
  const trimmedName = name.trim();
  const count = await prisma.recipeCategory.count({ where: { userId: req.userId } });
  try {
    const category = await prisma.recipeCategory.create({
      data: { userId: req.userId, name: trimmedName, position: count },
    });
    res.status(201).json(category);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json(fail(req, "categoryExists", { name: trimmedName }));
    }
    throw err;
  }
});

// PUT /api/recipe-categories/reorder { orderedIds: [id1, id2, ...] } - sets
// each category's position to its index in the given order
recipeCategoriesRouter.put("/reorder", async (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) {
    return res.status(400).json(fail(req, "required", { fields: "orderedIds[]" }));
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

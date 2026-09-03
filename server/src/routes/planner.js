import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const plannerRouter = Router();

// GET /api/planner - full week's placements, with recipe details included
plannerRouter.get("/", async (req, res) => {
  const entries = await prisma.plannerEntry.findMany({
    include: { recipe: { include: { ingredients: true } } },
    orderBy: [{ dayOfWeek: "asc" }, { position: "asc" }],
  });
  res.json(
    entries.map((e) => ({
      ...e,
      recipe: {
        ...e.recipe,
        instructions: JSON.parse(e.recipe.instructions),
        photos: e.recipe.photos ? JSON.parse(e.recipe.photos) : [],
        tags: e.recipe.tags ? JSON.parse(e.recipe.tags) : [],
      },
    }))
  );
});

// POST /api/planner - place a recipe card onto a day + meal slot
// body: { recipeId, dayOfWeek (0-6), mealType ("breakfast"|"lunch"|"dinner"), servings?, isLeftover?, position? }
plannerRouter.post("/", async (req, res) => {
  const { recipeId, dayOfWeek, mealType, servings, isLeftover, position } = req.body;
  if (!recipeId || dayOfWeek === undefined || !mealType) {
    return res.status(400).json({ error: "recipeId, dayOfWeek, and mealType are required" });
  }
  const entry = await prisma.plannerEntry.create({
    data: {
      recipeId,
      dayOfWeek,
      mealType,
      servings: servings ?? null,
      isLeftover: isLeftover ?? false,
      position: position ?? 0,
    },
    include: { recipe: { include: { ingredients: true } } },
  });
  res.status(201).json({
    ...entry,
    recipe: {
      ...entry.recipe,
      instructions: JSON.parse(entry.recipe.instructions),
      photos: entry.recipe.photos ? JSON.parse(entry.recipe.photos) : [],
      tags: entry.recipe.tags ? JSON.parse(entry.recipe.tags) : [],
    },
  });
});

// PUT /api/planner/:id - move a card, change planned servings, or toggle leftovers
plannerRouter.put("/:id", async (req, res) => {
  const { dayOfWeek, mealType, position, servings, isLeftover } = req.body;
  const entry = await prisma.plannerEntry.update({
    where: { id: req.params.id },
    data: {
      ...(dayOfWeek !== undefined && { dayOfWeek }),
      ...(mealType !== undefined && { mealType }),
      ...(position !== undefined && { position }),
      ...(servings !== undefined && { servings }),
      ...(isLeftover !== undefined && { isLeftover }),
    },
  });
  res.json(entry);
});

// DELETE /api/planner/:id - remove a card from the planner
plannerRouter.delete("/:id", async (req, res) => {
  await prisma.plannerEntry.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

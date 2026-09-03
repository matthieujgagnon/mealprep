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
// body: { recipeId, dayOfWeek (0-6), mealType ("breakfast"|"lunch"|"dinner"), servings?, isLeftover?, alreadyHave?, position? }
plannerRouter.post("/", async (req, res) => {
  const { recipeId, dayOfWeek, mealType, servings, isLeftover, alreadyHave, position } = req.body;
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
      alreadyHave: alreadyHave ?? false,
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

// POST /api/planner/blank { dayOfWeek, mealType } - mark a slot as
// intentionally empty (no meal planned) rather than just unplanned, so it
// reads differently from "haven't gotten to this yet". Reuses the same
// isPlaceholder mechanism the old Restaurant/YOLO/N-A cards used: finds or
// creates one hidden marker recipe and places it here — no schema change
// needed for PlannerEntry itself.
plannerRouter.post("/blank", async (req, res) => {
  const { dayOfWeek, mealType } = req.body;
  if (dayOfWeek === undefined || !mealType) {
    return res.status(400).json({ error: "dayOfWeek and mealType are required" });
  }

  let blankRecipe = await prisma.recipe.findFirst({
    where: { title: "No meal planned", isPlaceholder: true },
  });
  if (!blankRecipe) {
    blankRecipe = await prisma.recipe.create({
      data: {
        title: "No meal planned",
        isPlaceholder: true,
        inCookbook: false,
        inImported: false,
        instructions: JSON.stringify([]),
      },
    });
  }

  const entry = await prisma.plannerEntry.create({
    data: { recipeId: blankRecipe.id, dayOfWeek, mealType, position: 0 },
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

// PUT /api/planner/:id - move a card, change planned servings, or toggle leftovers/already-have
plannerRouter.put("/:id", async (req, res) => {
  const { dayOfWeek, mealType, position, servings, isLeftover, alreadyHave } = req.body;
  const entry = await prisma.plannerEntry.update({
    where: { id: req.params.id },
    data: {
      ...(dayOfWeek !== undefined && { dayOfWeek }),
      ...(mealType !== undefined && { mealType }),
      ...(position !== undefined && { position }),
      ...(servings !== undefined && { servings }),
      ...(isLeftover !== undefined && { isLeftover }),
      ...(alreadyHave !== undefined && { alreadyHave }),
    },
  });
  res.json(entry);
});

// DELETE /api/planner/:id - remove a card from the planner
plannerRouter.delete("/:id", async (req, res) => {
  await prisma.plannerEntry.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

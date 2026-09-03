import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const plannerRouter = Router();

function serializeEntry(e) {
  return {
    ...e,
    recipe: {
      ...e.recipe,
      instructions: JSON.parse(e.recipe.instructions),
      photos: e.recipe.photos ? JSON.parse(e.recipe.photos) : [],
      tags: e.recipe.tags ? JSON.parse(e.recipe.tags) : [],
    },
  };
}

// GET /api/planner?week=YYYY-MM-DD - one week's placements, with recipe
// details included. `week` is the Monday of the week to load; required so
// the board only ever shows one week at a time.
plannerRouter.get("/", async (req, res) => {
  const { week } = req.query;
  if (!week) {
    return res.status(400).json({ error: "week (Monday, YYYY-MM-DD) query param is required" });
  }
  const entries = await prisma.plannerEntry.findMany({
    where: { weekStart: week },
    include: { recipe: { include: { ingredients: true } } },
    orderBy: [{ dayOfWeek: "asc" }, { position: "asc" }],
  });
  res.json(entries.map(serializeEntry));
});

// POST /api/planner - place a recipe card onto a day + meal slot
// body: { recipeId, weekStart, dayOfWeek (0-6), mealType, servings?, isLeftover?, position? }
plannerRouter.post("/", async (req, res) => {
  const { recipeId, weekStart, dayOfWeek, mealType, servings, isLeftover, position } = req.body;
  if (!recipeId || !weekStart || dayOfWeek === undefined || !mealType) {
    return res
      .status(400)
      .json({ error: "recipeId, weekStart, dayOfWeek, and mealType are required" });
  }
  const entry = await prisma.plannerEntry.create({
    data: {
      recipeId,
      weekStart,
      dayOfWeek,
      mealType,
      servings: servings ?? null,
      isLeftover: isLeftover ?? false,
      position: position ?? 0,
    },
    include: { recipe: { include: { ingredients: true } } },
  });
  res.status(201).json(serializeEntry(entry));
});

// POST /api/planner/copy-week - duplicate every placement from one week onto
// another (used for the on-demand "copy last week" action). Leftover flags
// reset to false on the copy — a leftover marker describes that specific
// week's fridge stock, not the recipe itself.
plannerRouter.post("/copy-week", async (req, res) => {
  const { fromWeekStart, toWeekStart } = req.body;
  if (!fromWeekStart || !toWeekStart) {
    return res.status(400).json({ error: "fromWeekStart and toWeekStart are required" });
  }
  const source = await prisma.plannerEntry.findMany({ where: { weekStart: fromWeekStart } });
  if (!source.length) {
    return res.json([]);
  }
  await prisma.plannerEntry.createMany({
    data: source.map((e) => ({
      weekStart: toWeekStart,
      dayOfWeek: e.dayOfWeek,
      mealType: e.mealType,
      recipeId: e.recipeId,
      servings: e.servings,
      isLeftover: false,
      position: e.position,
    })),
  });
  const created = await prisma.plannerEntry.findMany({
    where: { weekStart: toWeekStart },
    include: { recipe: { include: { ingredients: true } } },
    orderBy: [{ dayOfWeek: "asc" }, { position: "asc" }],
  });
  res.status(201).json(created.map(serializeEntry));
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

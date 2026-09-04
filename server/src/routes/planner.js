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

// GET /api/planner?week=YYYY-MM-DD - one week's placements (Monday of that
// week), with recipe details included. `week` is required so the board only
// ever loads a single week at a time.
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
// body: { recipeId, weekStart, dayOfWeek (0-6), mealType ("breakfast"|"lunch"|"dinner"), servings?, isLeftover?, alreadyHave?, position? }
plannerRouter.post("/", async (req, res) => {
  const { recipeId, weekStart, dayOfWeek, mealType, servings, isLeftover, alreadyHave, position } = req.body;
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
      alreadyHave: alreadyHave ?? false,
      position: position ?? 0,
    },
    include: { recipe: { include: { ingredients: true } } },
  });
  res.status(201).json(serializeEntry(entry));
});

// POST /api/planner/blank { weekStart, dayOfWeek, mealType } - mark a slot as
// intentionally empty (no meal planned) rather than just unplanned, so it
// reads differently from "haven't gotten to this yet". Reuses the same
// isPlaceholder mechanism the old Restaurant/YOLO/N-A cards used: finds or
// creates one hidden marker recipe and places it here — no schema change
// needed for that part.
plannerRouter.post("/blank", async (req, res) => {
  const { weekStart, dayOfWeek, mealType } = req.body;
  if (!weekStart || dayOfWeek === undefined || !mealType) {
    return res.status(400).json({ error: "weekStart, dayOfWeek, and mealType are required" });
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
    data: { recipeId: blankRecipe.id, weekStart, dayOfWeek, mealType, position: 0 },
    include: { recipe: { include: { ingredients: true } } },
  });
  res.status(201).json(serializeEntry(entry));
});

// POST /api/planner/copy-week { fromWeekStart, toWeekStart } - duplicate
// every placement from one week onto another, so planning a new week can
// start from last week's shape instead of a blank board. Leftover/
// already-have flags reset to false on the copy — both describe that
// specific week's fridge/pantry state, not the recipe itself. Skips (rather
// than duplicating) any day+meal+recipe slot the target week already has,
// so re-running it after making a few manual tweaks is safe.
plannerRouter.post("/copy-week", async (req, res) => {
  const { fromWeekStart, toWeekStart } = req.body;
  if (!fromWeekStart || !toWeekStart) {
    return res.status(400).json({ error: "fromWeekStart and toWeekStart are required" });
  }
  const [source, existingTarget] = await Promise.all([
    prisma.plannerEntry.findMany({ where: { weekStart: fromWeekStart } }),
    prisma.plannerEntry.findMany({ where: { weekStart: toWeekStart } }),
  ]);
  const existingKeys = new Set(
    existingTarget.map((e) => `${e.dayOfWeek}-${e.mealType}-${e.recipeId}`)
  );
  const toCreate = source.filter(
    (e) => !existingKeys.has(`${e.dayOfWeek}-${e.mealType}-${e.recipeId}`)
  );
  if (toCreate.length > 0) {
    await prisma.plannerEntry.createMany({
      data: toCreate.map((e) => ({
        weekStart: toWeekStart,
        dayOfWeek: e.dayOfWeek,
        mealType: e.mealType,
        recipeId: e.recipeId,
        servings: e.servings,
        isLeftover: false,
        alreadyHave: false,
        position: e.position,
      })),
    });
  }
  const entries = await prisma.plannerEntry.findMany({
    where: { weekStart: toWeekStart },
    include: { recipe: { include: { ingredients: true } } },
    orderBy: [{ dayOfWeek: "asc" }, { position: "asc" }],
  });
  res.status(201).json(entries.map(serializeEntry));
});

// PUT /api/planner/:id - move a card (within or across weeks), change
// planned servings, or toggle leftovers/already-have
plannerRouter.put("/:id", async (req, res) => {
  const { weekStart, dayOfWeek, mealType, position, servings, isLeftover, alreadyHave } = req.body;
  const entry = await prisma.plannerEntry.update({
    where: { id: req.params.id },
    data: {
      ...(weekStart !== undefined && { weekStart }),
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

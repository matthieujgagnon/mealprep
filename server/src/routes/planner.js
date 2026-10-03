import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { fail } from "../lib/i18n.js";

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
    return res.status(400).json(fail(req, "required", { fields: "week (YYYY-MM-DD)" }));
  }
  const entries = await prisma.plannerEntry.findMany({
    where: { weekStart: week, userId: req.userId },
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
      .json(fail(req, "required", { fields: "recipeId, weekStart, dayOfWeek, mealType" }));
  }
  // Confirms the recipe being placed is actually this user's own before
  // creating a planner entry that points at it - otherwise a guessed or
  // leaked recipeId from another account could be placed on this planner.
  const recipe = await prisma.recipe.findFirst({ where: { id: recipeId, userId: req.userId } });
  if (!recipe) return res.status(404).json(fail(req, "notFound.recipe"));

  const entry = await prisma.plannerEntry.create({
    data: {
      userId: req.userId,
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

const BLANK_TITLE = "No meal planned";

// Finds or creates the (per-user) placeholder recipe for a given title -
// same isPlaceholder mechanism the old Restaurant/YOLO/N-A cards used.
// Reused by both the plain blank marker and a custom note, so typing the
// same note twice (e.g. "Ordering food") lands on the same underlying
// recipe rather than piling up duplicates.
async function findOrCreatePlaceholderRecipe(userId, title) {
  let recipe = await prisma.recipe.findFirst({ where: { title, isPlaceholder: true, userId } });
  if (!recipe) {
    recipe = await prisma.recipe.create({
      data: {
        userId,
        title,
        isPlaceholder: true,
        inCookbook: false,
        inImported: false,
        instructions: JSON.stringify([]),
      },
    });
  }
  return recipe;
}

// POST /api/planner/blank { weekStart, dayOfWeek, mealType, note? } - mark a
// slot as intentionally empty (no meal planned), or, with a note, as a
// custom non-recipe placement ("sandwich", "ordering food", "at a
// friend's") - reads differently from "haven't gotten to this yet" either
// way. The note becomes the placeholder recipe's title (see
// findOrCreatePlaceholderRecipe above).
plannerRouter.post("/blank", async (req, res) => {
  const { weekStart, dayOfWeek, mealType, note } = req.body;
  if (!weekStart || dayOfWeek === undefined || !mealType) {
    return res.status(400).json(fail(req, "required", { fields: "weekStart, dayOfWeek, mealType" }));
  }

  const title = typeof note === "string" && note.trim() ? note.trim() : BLANK_TITLE;
  const blankRecipe = await findOrCreatePlaceholderRecipe(req.userId, title);

  const entry = await prisma.plannerEntry.create({
    data: { userId: req.userId, recipeId: blankRecipe.id, weekStart, dayOfWeek, mealType, position: 0 },
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
    return res.status(400).json(fail(req, "required", { fields: "fromWeekStart, toWeekStart" }));
  }
  const [source, existingTarget] = await Promise.all([
    prisma.plannerEntry.findMany({ where: { weekStart: fromWeekStart, userId: req.userId } }),
    prisma.plannerEntry.findMany({ where: { weekStart: toWeekStart, userId: req.userId } }),
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
        userId: req.userId,
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
    where: { weekStart: toWeekStart, userId: req.userId },
    include: { recipe: { include: { ingredients: true } } },
    orderBy: [{ dayOfWeek: "asc" }, { position: "asc" }],
  });
  res.status(201).json(entries.map(serializeEntry));
});

// PUT /api/planner/:id/note { note? } - change what text a blank/custom
// placeholder card shows, by repointing the entry at a different (found or
// created) placeholder recipe - notes live on the placeholder Recipe's
// title, the same mechanism POST /blank uses, so no separate note column
// is needed. An empty/omitted note reverts to the plain "No meal planned"
// blank marker. Declared before PUT /:id below since it's a distinct,
// more specific path - registration order doesn't actually matter here
// (Express only routes a request to the pattern that matches its exact
// segment count), but this keeps the two /:id-shaped routes next to each
// other for readability.
plannerRouter.put("/:id/note", async (req, res) => {
  const { note } = req.body;
  const entry = await prisma.plannerEntry.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { recipe: true },
  });
  if (!entry) return res.status(404).json(fail(req, "notFound.plannerEntry"));
  if (!entry.recipe.isPlaceholder) {
    return res.status(400).json(fail(req, "onlyNoteEditable"));
  }

  const title = typeof note === "string" && note.trim() ? note.trim() : BLANK_TITLE;
  const recipe = await findOrCreatePlaceholderRecipe(req.userId, title);

  const updated = await prisma.plannerEntry.update({
    where: { id: entry.id },
    data: { recipeId: recipe.id },
    include: { recipe: { include: { ingredients: true } } },
  });
  res.json(serializeEntry(updated));
});

// PUT /api/planner/:id - move a card (within or across weeks), change
// planned servings, or toggle leftovers/already-have
plannerRouter.put("/:id", async (req, res) => {
  const { weekStart, dayOfWeek, mealType, position, servings, isLeftover, alreadyHave } = req.body;
  const { count } = await prisma.plannerEntry.updateMany({
    where: { id: req.params.id, userId: req.userId },
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
  if (count === 0) return res.status(404).json(fail(req, "notFound.plannerEntry"));

  const entry = await prisma.plannerEntry.findFirst({ where: { id: req.params.id, userId: req.userId } });
  res.json(entry);
});

// DELETE /api/planner/:id - remove a card from the planner
plannerRouter.delete("/:id", async (req, res) => {
  await prisma.plannerEntry.deleteMany({ where: { id: req.params.id, userId: req.userId } });
  res.status(204).send();
});

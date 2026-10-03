import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { scrapeRecipe, parseIngredientText } from "../lib/scrapeRecipe.js";
import { estimateFridgeLifeDays } from "../lib/fridgeLife.js";
import { fail } from "../lib/i18n.js";

export const recipesRouter = Router();

// Where a recipe sits on the Planner - see Recipe.mealSlot.
export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "side", "snack", "prep"];

// undefined = leave as-is (PUT), null/"" = clear, anything else must be a
// known slot.
function readMealSlot(value) {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null || value === "") return { ok: true, value: null };
  return MEAL_SLOTS.includes(value) ? { ok: true, value } : { ok: false };
}

// The scraper's English reasons, as messages in the reader's language.
const SCRAPE_REASONS = [
  [/took too long/, "scrape.timeout"],
  [/Couldn't reach this URL \((.*)\)/, "scrape.unreachable", (m) => ({ detail: m[1] })],
  [/Failed to fetch URL \(status (\d+)\)/, "scrape.status", (m) => ({ status: m[1] })],
  [/valid URL/, "scrape.invalidUrl"],
  [/Only http and https/, "scrape.httpOnly"],
  [/Couldn't resolve/, "scrape.unresolved"],
  [/can't be imported/, "scrape.blocked"],
  [/^NO_STRUCTURED_DATA/, "scrape.noData"],
];

function scrapeErrorResponse(req, res, err) {
  const text = String(err.message);
  const reason = text.startsWith("NO_STRUCTURED_DATA") ? "noData" : text.startsWith("FETCH_FAILED") ? "fetch" : null;
  const needsManualEntry = reason != null;
  for (const [re, key, vars] of SCRAPE_REASONS) {
    const m = re.exec(text);
    if (m) return res.status(needsManualEntry ? 422 : 502).json(fail(req, key, vars?.(m), { needsManualEntry, reason }));
  }
  return res.status(needsManualEntry ? 422 : 502).json({
    error: text.replace(/^(NO_STRUCTURED_DATA|FETCH_FAILED):\s*/, ""),
    needsManualEntry,
    reason,
  });
}

function serializeRecipe(recipe) {
  return {
    ...recipe,
    instructions: JSON.parse(recipe.instructions),
    photos: recipe.photos ? JSON.parse(recipe.photos) : [],
    tags: recipe.tags ? JSON.parse(recipe.tags) : [],
    ingredients: recipe.ingredients?.sort((a, b) => a.position - b.position),
  };
}

// GET /api/recipes - list all saved recipes. position sorts first — every
// recipe defaults to position 0, so until something's actually been
// drag-reordered this falls through to createdAt desc (newest first), the
// same order the app has always shown.
recipesRouter.get("/", async (req, res) => {
  const recipes = await prisma.recipe.findMany({
    where: { userId: req.userId },
    include: { ingredients: true },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
  });
  res.json(recipes.map(serializeRecipe));
});

// GET /api/recipes/:id
recipesRouter.get("/:id", async (req, res) => {
  const recipe = await prisma.recipe.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { ingredients: true },
  });
  if (!recipe) return res.status(404).json(fail(req, "notFound.recipe"));
  res.json(serializeRecipe(recipe));
});

// POST /api/recipes/import { url } - scrape + save a recipe from a URL
recipesRouter.post("/import", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json(fail(req, "required", { fields: "url" }));

  let parsed;
  try {
    parsed = await scrapeRecipe(url);
  } catch (err) {
    return scrapeErrorResponse(req, res, err);
  }

  const recipe = await prisma.recipe.create({
    data: {
      userId: req.userId,
      title: parsed.title,
      sourceUrl: parsed.sourceUrl,
      photoUrl: parsed.photoUrl,
      photos: JSON.stringify(parsed.photos || []),
      inImported: true,
      baseServings: parsed.baseServings,
      prepTimeMinutes: parsed.prepTimeMinutes,
      cookTimeMinutes: parsed.cookTimeMinutes,
      fridgeLifeDays: estimateFridgeLifeDays(parsed.ingredients.map((i) => i.name)),
      instructions: JSON.stringify(parsed.instructions),
      ingredients: {
        create: parsed.ingredients.map((ing) => ({
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          notes: ing.notes || null,
          group: ing.group || null,
          position: ing.position,
        })),
      },
    },
    include: { ingredients: true },
  });

  res.status(201).json(serializeRecipe(recipe));
});

// POST /api/recipes/scrape { url } - reads a recipe link without saving
// anything, for the editor's "Re-import" (which only fills fields that are
// still empty - that merge happens client-side).
recipesRouter.post("/scrape", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json(fail(req, "required", { fields: "url" }));
  try {
    const parsed = await scrapeRecipe(url);
    res.json({
      ...parsed,
      fridgeLifeDays: estimateFridgeLifeDays(parsed.ingredients.map((i) => i.name)),
    });
  } catch (err) {
    return scrapeErrorResponse(req, res, err);
  }
});

// POST /api/recipes/parse-ingredients { text } - splits a pasted ingredient
// list into qty/unit/name/note rows with the importer's own parser.
recipesRouter.post("/parse-ingredients", async (req, res) => {
  const { text } = req.body;
  if (typeof text !== "string") return res.status(400).json(fail(req, "required", { fields: "text" }));
  res.json({ ingredients: parseIngredientText(text.slice(0, 20000)) });
});

// POST /api/recipes - manual entry (fallback when import fails, or add-your-own)
recipesRouter.post("/", async (req, res) => {
  const { title, photoUrl, photos, notes, sourceUrl, baseServings, prepTimeMinutes, cookTimeMinutes, fridgeLifeDays, instructions, ingredients, tags } = req.body;

  if (!title || !Array.isArray(ingredients)) {
    return res.status(400).json(fail(req, "required", { fields: "title, ingredients[]" }));
  }
  const mealSlot = readMealSlot(req.body.mealSlot);
  if (!mealSlot.ok) return res.status(400).json(fail(req, "mustBeOneOf", { field: "mealSlot", options: MEAL_SLOTS.join(", ") }));

  const recipe = await prisma.recipe.create({
    data: {
      userId: req.userId,
      title,
      photoUrl: photoUrl || null,
      photos: JSON.stringify(photos || []),
      notes: notes || null,
      sourceUrl: sourceUrl || null,
      baseServings: baseServings || 4,
      inCookbook: true,
      inImported: false,
      prepTimeMinutes: prepTimeMinutes || null,
      cookTimeMinutes: cookTimeMinutes || null,
      fridgeLifeDays: fridgeLifeDays || null,
      mealSlot: mealSlot.value ?? null,
      instructions: JSON.stringify(instructions || []),
      ...(Array.isArray(tags) && { tags: JSON.stringify(tags) }),
      ingredients: {
        create: ingredients.map((ing, i) => ({
          name: ing.name,
          quantity: ing.quantity ?? null,
          unit: ing.unit ?? null,
          notes: ing.notes ?? null,
          group: ing.group ?? null,
          position: ing.position ?? i,
        })),
      },
    },
    include: { ingredients: true },
  });

  res.status(201).json(serializeRecipe(recipe));
});

// PUT /api/recipes/reorder { orderedIds: [id1, id2, ...] } - sets each
// recipe's position to its index in the given order. Registered before
// PUT /:id so "reorder" isn't swallowed as a recipe id.
recipesRouter.put("/reorder", async (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) {
    return res.status(400).json(fail(req, "required", { fields: "orderedIds[]" }));
  }
  await prisma.$transaction(
    orderedIds.map((id, position) =>
      prisma.recipe.updateMany({ where: { id, userId: req.userId }, data: { position } })
    )
  );
  res.status(204).send();
});

// PUT /api/recipes/:id - edit a recipe (title, servings, ingredients, instructions)
recipesRouter.put("/:id", async (req, res) => {
  const { title, photoUrl, photos, notes, sourceUrl, baseServings, prepTimeMinutes, cookTimeMinutes, fridgeLifeDays, instructions, ingredients, inCookbook, inImported, tags, categoryId } = req.body;
  const mealSlot = readMealSlot(req.body.mealSlot);
  if (!mealSlot.ok) return res.status(400).json(fail(req, "mustBeOneOf", { field: "mealSlot", options: MEAL_SLOTS.join(", ") }));

  const { count } = await prisma.recipe.updateMany({
    where: { id: req.params.id, userId: req.userId },
    data: {
      ...(title !== undefined && { title }),
      ...(photoUrl !== undefined && { photoUrl }),
      ...(photos !== undefined && { photos: JSON.stringify(photos) }),
      ...(notes !== undefined && { notes: notes || null }),
      ...(sourceUrl !== undefined && { sourceUrl: sourceUrl || null }),
      ...(baseServings !== undefined && { baseServings }),
      ...(prepTimeMinutes !== undefined && { prepTimeMinutes }),
      ...(cookTimeMinutes !== undefined && { cookTimeMinutes }),
      ...(fridgeLifeDays !== undefined && { fridgeLifeDays }),
      ...(inCookbook !== undefined && { inCookbook }),
      ...(inImported !== undefined && { inImported }),
      ...(tags !== undefined && { tags: JSON.stringify(tags) }),
      ...(categoryId !== undefined && { categoryId }),
      ...(mealSlot.value !== undefined && { mealSlot: mealSlot.value }),
      ...(instructions !== undefined && { instructions: JSON.stringify(instructions) }),
    },
  });
  if (count === 0) return res.status(404).json(fail(req, "notFound.recipe"));

  if (Array.isArray(ingredients)) {
    await prisma.ingredient.deleteMany({ where: { recipeId: req.params.id } });
    await prisma.ingredient.createMany({
      data: ingredients.map((ing, i) => ({
        recipeId: req.params.id,
        name: ing.name,
        quantity: ing.quantity ?? null,
        unit: ing.unit ?? null,
        notes: ing.notes ?? null,
        group: ing.group ?? null,
        position: ing.position ?? i,
      })),
    });
  }

  const recipe = await prisma.recipe.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { ingredients: true },
  });
  res.json(serializeRecipe(recipe));
});

// DELETE /api/recipes/:id
recipesRouter.delete("/:id", async (req, res) => {
  await prisma.recipe.deleteMany({ where: { id: req.params.id, userId: req.userId } });
  res.status(204).send();
});

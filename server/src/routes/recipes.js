import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { scrapeRecipe } from "../lib/scrapeRecipe.js";
import { estimateFridgeLifeDays } from "../lib/fridgeLife.js";

export const recipesRouter = Router();

function serializeRecipe(recipe) {
  return {
    ...recipe,
    instructions: JSON.parse(recipe.instructions),
    photos: recipe.photos ? JSON.parse(recipe.photos) : [],
    tags: recipe.tags ? JSON.parse(recipe.tags) : [],
    ingredients: recipe.ingredients?.sort((a, b) => a.position - b.position),
  };
}

// GET /api/recipes - list all saved recipes
recipesRouter.get("/", async (req, res) => {
  const recipes = await prisma.recipe.findMany({
    include: { ingredients: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(recipes.map(serializeRecipe));
});

// GET /api/recipes/:id
recipesRouter.get("/:id", async (req, res) => {
  const recipe = await prisma.recipe.findUnique({
    where: { id: req.params.id },
    include: { ingredients: true },
  });
  if (!recipe) return res.status(404).json({ error: "Recipe not found" });
  res.json(serializeRecipe(recipe));
});

// POST /api/recipes/import { url } - scrape + save a recipe from a URL
recipesRouter.post("/import", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "url is required" });

  let parsed;
  try {
    parsed = await scrapeRecipe(url);
  } catch (err) {
    const needsManualEntry =
      String(err.message).startsWith("NO_STRUCTURED_DATA") ||
      String(err.message).startsWith("FETCH_FAILED");
    return res.status(needsManualEntry ? 422 : 502).json({
      error: err.message.replace(/^(NO_STRUCTURED_DATA|FETCH_FAILED):\s*/, ""),
      needsManualEntry,
    });
  }

  const recipe = await prisma.recipe.create({
    data: {
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

// POST /api/recipes - manual entry (fallback when import fails, or add-your-own)
recipesRouter.post("/", async (req, res) => {
  const { title, photoUrl, photos, baseServings, prepTimeMinutes, cookTimeMinutes, fridgeLifeDays, instructions, ingredients } = req.body;

  if (!title || !Array.isArray(ingredients)) {
    return res.status(400).json({ error: "title and ingredients[] are required" });
  }

  const recipe = await prisma.recipe.create({
    data: {
      title,
      photoUrl: photoUrl || null,
      photos: JSON.stringify(photos || []),
      baseServings: baseServings || 4,
      inCookbook: true,
      inImported: false,
      prepTimeMinutes: prepTimeMinutes || null,
      cookTimeMinutes: cookTimeMinutes || null,
      fridgeLifeDays: fridgeLifeDays || null,
      instructions: JSON.stringify(instructions || []),
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

// PUT /api/recipes/:id - edit a recipe (title, servings, ingredients, instructions)
recipesRouter.put("/:id", async (req, res) => {
  const { title, photoUrl, photos, baseServings, prepTimeMinutes, cookTimeMinutes, fridgeLifeDays, instructions, ingredients, inCookbook, inImported, tags, categoryId } = req.body;

  await prisma.recipe.update({
    where: { id: req.params.id },
    data: {
      ...(title !== undefined && { title }),
      ...(photoUrl !== undefined && { photoUrl }),
      ...(photos !== undefined && { photos: JSON.stringify(photos) }),
      ...(baseServings !== undefined && { baseServings }),
      ...(prepTimeMinutes !== undefined && { prepTimeMinutes }),
      ...(cookTimeMinutes !== undefined && { cookTimeMinutes }),
      ...(fridgeLifeDays !== undefined && { fridgeLifeDays }),
      ...(inCookbook !== undefined && { inCookbook }),
      ...(inImported !== undefined && { inImported }),
      ...(tags !== undefined && { tags: JSON.stringify(tags) }),
      ...(categoryId !== undefined && { categoryId }),
      ...(instructions !== undefined && { instructions: JSON.stringify(instructions) }),
    },
  });

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

  const recipe = await prisma.recipe.findUnique({
    where: { id: req.params.id },
    include: { ingredients: true },
  });
  res.json(serializeRecipe(recipe));
});

// DELETE /api/recipes/:id
recipesRouter.delete("/:id", async (req, res) => {
  await prisma.recipe.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

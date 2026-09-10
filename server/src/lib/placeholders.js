import { prisma } from "./prisma.js";

// Generic "quick add" planner cards (Restaurant / YOLO / N/A) — these are
// just Recipe rows with no ingredients, flagged isPlaceholder so they're
// hidden from the Imported/Cookbook views but still draggable onto the
// planner like any real recipe. Seeded once per user, at signup, now that
// Recipe (and therefore these) belong to a specific account.
const PLACEHOLDER_RECIPES = [
  { title: "🍽️ Restaurant", baseServings: 1 },
  { title: "🎲 Figure it out / YOLO", baseServings: 1 },
  { title: "➖ N/A", baseServings: 1 },
];

export async function seedPlaceholderRecipesForUser(userId) {
  for (const p of PLACEHOLDER_RECIPES) {
    const existing = await prisma.recipe.findFirst({
      where: { userId, isPlaceholder: true, title: p.title },
    });
    if (!existing) {
      await prisma.recipe.create({
        data: {
          userId,
          title: p.title,
          baseServings: p.baseServings,
          isPlaceholder: true,
          inImported: false,
          inCookbook: false,
          instructions: "[]",
          photos: "[]",
        },
      });
    }
  }
}

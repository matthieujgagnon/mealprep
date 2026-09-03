import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "./lib/prisma.js";
import { recipesRouter } from "./routes/recipes.js";
import { plannerRouter } from "./routes/planner.js";
import { dealsRouter } from "./routes/deals.js";
import { pantryStaplesRouter } from "./routes/pantryStaples.js";
import { grocerySectionsRouter } from "./routes/grocerySections.js";
import { recipeCategoriesRouter } from "./routes/recipeCategories.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/recipes", recipesRouter);
app.use("/api/planner", plannerRouter);
app.use("/api/deals", dealsRouter);
app.use("/api/pantry-staples", pantryStaplesRouter);
app.use("/api/grocery-sections", grocerySectionsRouter);
app.use("/api/recipe-categories", recipeCategoriesRouter);

app.get("/api/health", (req, res) => res.json({ ok: true }));

// In production, this one server hosts both the API and the already-built
// React app (client/dist) — one deployment, one URL, no CORS to worry about.
// In local dev, the frontend instead runs separately via Vite (npm run dev:client),
// so this block simply won't find a dist/ folder and is skipped.
const clientDistPath = path.join(__dirname, "../../client/dist");
app.use(express.static(clientDistPath));
app.get(/^(?!\/api).*/, (req, res, next) => {
  res.sendFile(path.join(clientDistPath, "index.html"), (err) => {
    if (err) next(); // no built frontend present (local dev) — fall through
  });
});

// Generic "quick add" planner cards (Restaurant / YOLO / N/A) — these are just
// Recipe rows with no ingredients, flagged isPlaceholder so they're hidden
// from the Imported/Cookbook views but still draggable onto the planner like
// any real recipe. Created once on first server start.
const PLACEHOLDER_RECIPES = [
  { title: "🍽️ Restaurant", baseServings: 1 },
  { title: "🎲 Figure it out / YOLO", baseServings: 1 },
  { title: "➖ N/A", baseServings: 1 },
];

async function seedPlaceholderRecipes() {
  for (const p of PLACEHOLDER_RECIPES) {
    const existing = await prisma.recipe.findFirst({
      where: { isPlaceholder: true, title: p.title },
    });
    if (!existing) {
      await prisma.recipe.create({
        data: {
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

const port = process.env.PORT || 4000;
seedPlaceholderRecipes()
  .catch((err) => console.error("Failed to seed placeholder recipes:", err))
  .finally(() => {
    app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });
  });

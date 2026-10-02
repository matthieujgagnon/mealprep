import "./lib/asyncErrors.js";
import express from "express";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import { requireAuth } from "./lib/auth.js";
import { authRouter } from "./routes/auth.js";
import { recipesRouter } from "./routes/recipes.js";
import { plannerRouter } from "./routes/planner.js";
import { dealsRouter, forgetAllDeals } from "./routes/deals.js";
import { flyersRouter } from "./routes/flyers.js";
import { pantryStaplesRouter } from "./routes/pantryStaples.js";
import { grocerySectionsRouter } from "./routes/grocerySections.js";
import { groceryCheckedRouter } from "./routes/groceryChecked.js";
import { groceryExtraItemsRouter } from "./routes/groceryExtraItems.js";
import { groceryItemOverridesRouter } from "./routes/groceryItemOverrides.js";
import { inventoryLayoutRouter } from "./routes/inventoryLayout.js";
import { recipeCategoriesRouter } from "./routes/recipeCategories.js";
import { pantryInventoryRouter } from "./routes/pantryInventory.js";
import { receiptsRouter } from "./routes/receipts.js";
import { pantryLocationsRouter } from "./routes/pantryLocations.js";
import { watchlistRouter } from "./routes/watchlist.js";
import { recipeImagesRouter } from "./routes/recipeImages.js";
import { cronRouter } from "./routes/cron.js";
import { startFlyerScheduler } from "./lib/flyerImport.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
// Render terminates TLS at its own proxy and forwards plain HTTP internally,
// so without this Express would see every request as insecure and never
// consider `secure: true` cookies (see lib/auth.js) safe to send.
app.set("trust proxy", 1);
// Gzip JSON and the app bundle - the Flyers list alone is ~1 MB uncompressed.
app.use(compression());
app.use(cors());
app.use(cookieParser());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
// Machine-to-machine: checks its own shared secret instead of a session.
app.use("/api/cron", cronRouter);

// Everything below is per-account data - requireAuth attaches req.userId,
// which every route uses to scope its own queries.
app.use("/api/recipes", requireAuth, recipesRouter);
app.use("/api/planner", requireAuth, plannerRouter);
app.use("/api/deals", requireAuth, dealsRouter);
app.use("/api/flyers", requireAuth, flyersRouter);
app.use("/api/pantry-staples", requireAuth, pantryStaplesRouter);
app.use("/api/grocery-sections", requireAuth, grocerySectionsRouter);
app.use("/api/grocery-checked", requireAuth, groceryCheckedRouter);
app.use("/api/grocery-extra-items", requireAuth, groceryExtraItemsRouter);
app.use("/api/grocery-item-overrides", requireAuth, groceryItemOverridesRouter);
app.use("/api/inventory-layout", requireAuth, inventoryLayoutRouter);
app.use("/api/recipe-categories", requireAuth, recipeCategoriesRouter);
app.use("/api/pantry-inventory", requireAuth, pantryInventoryRouter);
app.use("/api/receipts", requireAuth, receiptsRouter);
app.use("/api/pantry-locations", requireAuth, pantryLocationsRouter);
app.use("/api/watchlist", requireAuth, watchlistRouter);
app.use("/api/recipe-images", requireAuth, recipeImagesRouter);

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

// Anything a route throws ends here as a JSON error instead of crashing the
// server (see lib/asyncErrors.js).
app.use((err, req, res, next) => {
  console.error(`${req.method} ${req.originalUrl} failed:`, err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: "Something went wrong - please try again." });
});

// Last line of defence: log a stray rejection rather than exiting.
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
});

// Placeholder recipes (the "quick add" Restaurant/YOLO/N-A cards) now belong
// to each account and are seeded at signup time instead - see
// lib/placeholders.js and routes/auth.js.
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  startFlyerScheduler({ onRenamed: forgetAllDeals });
});

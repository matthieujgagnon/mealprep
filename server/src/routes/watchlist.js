import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const watchlistRouter = Router();

// GET /api/watchlist - every ingredient (by matchName) the user is
// watching, for the Flyers screen's ★ state and watchlist rail/filter.
watchlistRouter.get("/", async (req, res) => {
  const items = await prisma.watchlistItem.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "desc" },
  });
  res.json(items);
});

// POST /api/watchlist { matchName } - toggle an ingredient onto the
// watchlist. Idempotent via the userId+matchName unique constraint, same
// upsert-not-error pattern as pantry-staples: clicking ★ on an item already
// watched (e.g. from two different deals matching the same ingredient) just
// no-ops rather than erroring.
watchlistRouter.post("/", async (req, res) => {
  const { matchName } = req.body;
  if (!matchName || !matchName.trim()) {
    return res.status(400).json({ error: "matchName is required" });
  }
  const normalized = matchName.trim().toLowerCase();
  const item = await prisma.watchlistItem.upsert({
    where: { userId_matchName: { userId: req.userId, matchName: normalized } },
    create: { userId: req.userId, matchName: normalized },
    update: {},
  });
  res.status(201).json(item);
});

// DELETE /api/watchlist/:matchName - untoggle. :matchName is user-derived
// text (lowercased at write time) so it's matched via a plain param and
// re-normalized here, the same way pantry-staples' :core route does.
watchlistRouter.delete("/:matchName", async (req, res) => {
  const normalized = req.params.matchName.toLowerCase();
  await prisma.watchlistItem.deleteMany({
    where: { userId: req.userId, matchName: normalized },
  });
  res.status(204).send();
});

import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { fail, langOf, normalizeLang } from "../lib/i18n.js";
import { createExamples, exampleCounts, exampleSummary, hasExamples, removeExamples, undoRemoval } from "../lib/examples.js";

export const examplesRouter = Router();

// The language examples are made in: the account's own (it is saved when the app's language is
// switched), else the one the app is asking in.
async function languageOf(req) {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { locale: true } });
  return normalizeLang(user?.locale) || langOf(req);
}

// GET /api/examples - what the banner, the account menu and the sheets say:
// { counts: { recipes, plannedMeals, inventoryItems, total }, canAdd, preview }.
// `counts` is exactly what « Retirer les exemples » would take right now (an example the person
// has changed is theirs and not counted); `canAdd` is true when the account has no example left;
// `preview` is what « Ajouter des exemples » would add (counts and the Inventory names, in the
// language they would be made in).
examplesRouter.get("/", async (req, res) => {
  const [counts, present, lang] = await Promise.all([exampleCounts(req.userId), hasExamples(prisma, req.userId), languageOf(req)]);
  res.json({ counts, canAdd: !present, preview: exampleSummary(lang) });
});

// POST /api/examples - « Ajouter des exemples »: adds the whole set (recipes, planned week,
// Inventory) in one step. 409 when the account already has examples. The person confirmed it in
// the sheet that lists exactly this (CLAUDE.md).
examplesRouter.post("/", async (req, res) => {
  const added = await createExamples(req.userId, { lang: await languageOf(req) });
  if (!added) return res.status(409).json(fail(req, "examplesPresent"));
  res.status(201).json({ added });
});

// DELETE /api/examples - « Retirer les exemples »: removes only what still has the example mark
// (lib/examples.js) and keeps an exact copy for Undo. Resolves with the counts removed.
examplesRouter.delete("/", async (req, res) => {
  res.json({ removed: await removeExamples(req.userId) });
});

// POST /api/examples/undo - Undo of a removal: puts back exactly what that removal took.
examplesRouter.post("/undo", async (req, res) => {
  const restored = await undoRemoval(req.userId);
  if (!restored) return res.status(404).json(fail(req, "notFound.examples"));
  res.json({ restored });
});

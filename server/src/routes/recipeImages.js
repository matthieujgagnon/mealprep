import express, { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { fail } from "../lib/i18n.js";

export const recipeImagesRouter = Router();

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 8 * 1024 * 1024;

// POST /api/recipe-images - body is the image itself (Content-Type set to
// its type). The editor shrinks a dropped photo before sending it, so this
// cap is only a backstop. Returns the path to use as the photo's URL.
recipeImagesRouter.post("/", express.raw({ type: () => true, limit: MAX_BYTES }), async (req, res) => {
  const mimeType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (!ACCEPTED.includes(mimeType)) {
    return res.status(415).json(fail(req, "photoType"));
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json(fail(req, "photoEmpty"));
  }
  const image = await prisma.recipeImage.create({
    data: { userId: req.userId, mimeType, data: req.body },
    select: { id: true },
  });
  res.status(201).json({ id: image.id, url: `/api/recipe-images/${image.id}` });
});

// GET /api/recipe-images/:id - the stored bytes. An upload never changes,
// so the browser can keep it.
recipeImagesRouter.get("/:id", async (req, res) => {
  const image = await prisma.recipeImage.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!image) return res.status(404).json(fail(req, "notFound.photo"));
  res.set("Content-Type", image.mimeType);
  res.set("Cache-Control", "private, max-age=31536000, immutable");
  res.send(image.data);
});

import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const inventoryLayoutRouter = Router();

const SIZES = ["third", "half", "full"];

// GET /api/inventory-layout - the user's section order, sizes and built-in
// section names (see InventorySectionLayout).
inventoryLayoutRouter.get("/", async (req, res) => {
  const rows = await prisma.inventorySectionLayout.findMany({
    where: { userId: req.userId },
    orderBy: { position: "asc" },
  });
  res.json(rows);
});

// PUT /api/inventory-layout { sections: [{ sectionId, label?, size? }] }
// Replaces the whole layout; list order is the display order.
inventoryLayoutRouter.put("/", async (req, res) => {
  const { sections } = req.body;
  if (!Array.isArray(sections)) return res.status(400).json({ error: "sections must be an array" });
  const seen = new Set();
  const data = [];
  for (const s of sections) {
    if (!s || typeof s.sectionId !== "string" || !s.sectionId || seen.has(s.sectionId)) continue;
    seen.add(s.sectionId);
    const label = typeof s.label === "string" && s.label.trim() ? s.label.trim().slice(0, 40) : null;
    data.push({
      userId: req.userId,
      sectionId: s.sectionId,
      label,
      position: data.length,
      size: SIZES.includes(s.size) ? s.size : "half",
    });
  }
  await prisma.$transaction([
    prisma.inventorySectionLayout.deleteMany({ where: { userId: req.userId } }),
    prisma.inventorySectionLayout.createMany({ data }),
  ]);
  const rows = await prisma.inventorySectionLayout.findMany({
    where: { userId: req.userId },
    orderBy: { position: "asc" },
  });
  res.json(rows);
});

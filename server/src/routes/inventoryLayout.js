import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const inventoryLayoutRouter = Router();

// Width in grid columns, "1"-"6" (the older named sizes still read fine).
const LEGACY_SIZES = { third: "2", half: "3", full: "6" };
function normalizeSize(size) {
  const value = LEGACY_SIZES[size] || String(size ?? "");
  return /^[1-6]$/.test(value) ? value : "3";
}

// GET /api/inventory-layout - the user's section order, sizes and built-in
// section names (see InventorySectionLayout).
inventoryLayoutRouter.get("/", async (req, res) => {
  const rows = await prisma.inventorySectionLayout.findMany({
    where: { userId: req.userId },
    orderBy: { position: "asc" },
  });
  res.json(rows);
});

// PUT /api/inventory-layout { sections: [{ sectionId, label?, size?, height? }] }
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
      size: normalizeSize(s.size),
      height: Number.isInteger(s.height) && s.height >= 120 && s.height <= 2000 ? s.height : null,
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

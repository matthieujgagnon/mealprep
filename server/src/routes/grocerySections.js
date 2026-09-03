import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const grocerySectionsRouter = Router();

// GET /api/grocery-sections - list all sections with their item assignments
grocerySectionsRouter.get("/", async (req, res) => {
  const sections = await prisma.grocerySection.findMany({
    include: { assignments: true },
    orderBy: { position: "asc" },
  });
  res.json(sections);
});

// POST /api/grocery-sections { name } - create a new empty section
grocerySectionsRouter.post("/", async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  const count = await prisma.grocerySection.count();
  const section = await prisma.grocerySection.create({
    data: { name: name.trim(), position: count },
    include: { assignments: true },
  });
  res.status(201).json(section);
});

// DELETE /api/grocery-sections/:id - remove a section (its items go back to unsorted)
grocerySectionsRouter.delete("/:id", async (req, res) => {
  await prisma.grocerySection.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// POST /api/grocery-sections/:id/assign { core } - move an ingredient into this section
grocerySectionsRouter.post("/:id/assign", async (req, res) => {
  const { core } = req.body;
  if (!core || !core.trim()) {
    return res.status(400).json({ error: "core is required" });
  }
  const normalized = core.trim().toLowerCase();

  const assignment = await prisma.groceryAssignment.upsert({
    where: { core: normalized },
    update: { sectionId: req.params.id },
    create: { core: normalized, sectionId: req.params.id },
  });
  res.status(201).json(assignment);
});

// DELETE /api/grocery-sections/assignments/:core - unassign an ingredient (back to unsorted)
grocerySectionsRouter.delete("/assignments/:core", async (req, res) => {
  await prisma.groceryAssignment.deleteMany({
    where: { core: req.params.core.toLowerCase() },
  });
  res.status(204).send();
});

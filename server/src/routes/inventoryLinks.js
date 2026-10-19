import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { fail } from "../lib/i18n.js";
import { cleanLinkInput, LINK_MAX } from "../lib/inventoryLinks.js";

// « Je l'ai comme… » / "I have it as…". index.js mounts this behind requireAuth, so
// only a signed-in account reaches it (401 otherwise) and every query is for that
// account alone. It only keeps the pairs of names Matt taught; it adds nothing to
// Inventory and does no matching (lib/inventoryMatch.js on the client reads the links).
export const inventoryLinksRouter = Router();

const SHOWN = { id: true, recipeName: true, itemName: true, recipeLabel: true, itemLabel: true, createdAt: true };

// GET /api/inventory-links - your links, oldest first.
inventoryLinksRouter.get("/", async (req, res) => {
  const links = await prisma.inventoryLink.findMany({ where: { userId: req.userId }, orderBy: { createdAt: "asc" }, select: SHOWN });
  res.json(links);
});

// POST /api/inventory-links { recipeName, itemName } - "a recipe that says recipeName
// counts as having itemName". Saying it again is fine: the same link comes back (200
// instead of 201). 400 for an empty name, a name over LINK_NAME_MAX characters, or two
// names that are the same once accents and capitals are folded; 400 too when the
// account already has LINK_MAX links.
inventoryLinksRouter.post("/", async (req, res) => {
  const input = cleanLinkInput(req.body);
  if (input.error) return res.status(400).json(fail(req, input.error, input.vars));

  const where = { userId_recipeName_itemName: { userId: req.userId, recipeName: input.data.recipeName, itemName: input.data.itemName } };
  const existing = await prisma.inventoryLink.findUnique({ where, select: SHOWN });
  if (existing) return res.json(existing);

  if ((await prisma.inventoryLink.count({ where: { userId: req.userId } })) >= LINK_MAX) {
    return res.status(400).json(fail(req, "linkLimit", { max: LINK_MAX }));
  }
  try {
    const link = await prisma.inventoryLink.create({ data: { ...input.data, userId: req.userId }, select: SHOWN });
    res.status(201).json(link);
  } catch (error) {
    // Two taps at once: the other one made it first.
    if (error?.code !== "P2002") throw error;
    res.json(await prisma.inventoryLink.findUnique({ where, select: SHOWN }));
  }
});

// DELETE /api/inventory-links/:id - takes one of your links away. 404 for anyone
// else's, or one that is already gone.
inventoryLinksRouter.delete("/:id", async (req, res) => {
  const { count } = await prisma.inventoryLink.deleteMany({ where: { id: req.params.id, userId: req.userId } });
  if (count === 0) return res.status(404).json(fail(req, "notFound.link"));
  res.status(204).send();
});

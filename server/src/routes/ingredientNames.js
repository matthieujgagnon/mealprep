import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { fail } from "../lib/i18n.js";
import { checkAdmin } from "../lib/admin.js";
import { OVERRIDE_SELECT, overrideRow } from "../lib/ingredientNames.js";

// Matt's changes to the ingredient names table (lib/ingredientNames.js). index.js mounts this
// behind requireAuth, so only a signed-in account reaches it (401 otherwise). The changes are
// translations of the app, not personal data, so every account reads the same list and the app
// loads it for everyone; the routes that change it are admin only
// (routes/adminIngredientNames.js, under /api/admin).
export const ingredientNamesRouter = Router();

// GET /api/ingredient-names - every change, oldest first: { id, replaces, hidden, enOne, enOther,
// frOne, frOther, gender, updatedAt }. For an admin each also has `updatedBy`, the email of the
// account that saved it last (null when that account is gone).
ingredientNamesRouter.get("/", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(401).json(fail(req, "notLoggedIn"));
  const admin = await checkAdmin(user);
  const rows = await prisma.ingredientNameOverride.findMany({
    orderBy: { createdAt: "asc" },
    select: { ...OVERRIDE_SELECT, ...(admin ? { updatedBy: { select: { email: true } } } : {}) },
  });
  res.json(rows.map((row) => overrideRow(row, { admin })));
});

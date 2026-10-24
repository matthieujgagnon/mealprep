import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { fail } from "../lib/i18n.js";
import { OVERRIDE_SELECT, checkOverride, overrideRow } from "../lib/ingredientNames.js";

// Changing the ingredient names table. admin.js mounts this under /api/admin, behind requireAuth
// and requireAdmin, so every route here refuses a non-admin with 403 before it runs. Reading the
// list is open to every account (routes/ingredientNames.js).
//
// A save is checked by lib/ingredientNames.js `checkOverride`: the same rules as the form, and no
// spelling another row already has in the same language, built-in rows included (the server reads
// ingredientDisplay.txt once at start-up). 400 for a refused one, with the message in the
// language the app asked for.
export const adminIngredientNamesRouter = Router();

const SHOWN = { ...OVERRIDE_SELECT, updatedBy: { select: { email: true } } };
const shown = (row) => overrideRow(row, { admin: true });

const refuse = (req, res, checked) => res.status(checked.status || 400).json(fail(req, checked.error, checked.vars));

// POST /api/admin/ingredient-names { replaces?, hidden?, enOne, enOther, frOne, frOther, gender }
// - adds an ingredient, or (with `replaces`, a built-in row's key) replaces or hides that built-in
// row. If that built-in row already has a change it is the one that is changed, so a second tap
// can't make two (201 when new, 200 when changed).
adminIngredientNamesRouter.post("/", async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  for (let attempt = 0; attempt < 2; attempt++) {
    const all = await prisma.ingredientNameOverride.findMany({ select: OVERRIDE_SELECT });
    const wanted = typeof body.replaces === "string" ? body.replaces.trim() : "";
    const self = wanted ? all.find((row) => row.replaces === wanted) || null : null;
    const checked = checkOverride(body, all, self);
    if (checked.error) return refuse(req, res, checked);
    const data = { ...checked.data, updatedById: req.userId };
    try {
      if (self) return res.json(shown(await prisma.ingredientNameOverride.update({ where: { id: self.id }, data, select: SHOWN })));
      return res.status(201).json(shown(await prisma.ingredientNameOverride.create({ data, select: SHOWN })));
    } catch (error) {
      // Two taps at once: the other one made it first, so this one changes it instead.
      if (error?.code !== "P2002") throw error;
    }
  }
  res.status(500).json(fail(req, "generic"));
});

// PUT /api/admin/ingredient-names/:id { hidden?, enOne, enOther, frOne, frOther, gender } - changes
// one. It keeps the built-in row it stands in for (`replaces` can't be moved). 404 if it is gone.
adminIngredientNamesRouter.put("/:id", async (req, res) => {
  const all = await prisma.ingredientNameOverride.findMany({ select: OVERRIDE_SELECT });
  const self = all.find((row) => row.id === req.params.id);
  if (!self) return res.status(404).json(fail(req, "notFound.ingredientName"));
  const checked = checkOverride(req.body, all, self);
  if (checked.error) return refuse(req, res, checked);
  const row = await prisma.ingredientNameOverride.update({ where: { id: self.id }, data: { ...checked.data, updatedById: req.userId }, select: SHOWN });
  res.json(shown(row));
});

// DELETE /api/admin/ingredient-names/:id - removes one: a built-in row it replaced or hid comes
// back, an ingredient that was added goes. 404 if it is already gone. The log says who.
adminIngredientNamesRouter.delete("/:id", async (req, res) => {
  const row = await prisma.ingredientNameOverride.findUnique({ where: { id: req.params.id }, select: { id: true, replaces: true, enOne: true } });
  if (!row) return res.status(404).json(fail(req, "notFound.ingredientName"));
  const { count } = await prisma.ingredientNameOverride.deleteMany({ where: { id: row.id } });
  if (count === 0) return res.status(404).json(fail(req, "notFound.ingredientName"));
  console.log(`Admin ${req.userId} removed the ingredient name change for ${row.replaces ? `built-in "${row.replaces}"` : `"${row.enOne}"`}.`);
  res.status(204).send();
});

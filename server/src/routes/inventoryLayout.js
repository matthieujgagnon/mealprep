import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { fail } from "../lib/i18n.js";
import { BUILT_IN_NAMES, hidingAfter, hidingError, normalizeName } from "../lib/shelves.js";

export const inventoryLayoutRouter = Router();

// Width in grid columns: "c12:3"-"c12:12" on the 12-column grid, or an
// older 6-column "1"-"6" (the older named sizes still read fine).
const LEGACY_SIZES = { third: "2", half: "3", full: "6" };
function normalizeSize(size) {
  const value = LEGACY_SIZES[size] || String(size ?? "");
  if (/^c12:([3-9]|1[0-2])$/.test(value)) return value;
  return /^[1-6]$/.test(value) ? value : "c12:6";
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

// PUT /api/inventory-layout { sections: [{ sectionId, label?, size?, height?, hidden?, movedTo? }] }
// Replaces the whole layout; list order is the display order. `hidden` is how any shelf is deleted
// (nothing is deleted: the row stays with its name, place and size) and `movedTo` is the shelf its
// items show on meanwhile (lib/shelves.js). A field that is not sent is left as it is.
inventoryLayoutRouter.put("/", async (req, res) => {
  const { sections } = req.body;
  if (!Array.isArray(sections)) return res.status(400).json(fail(req, "mustBeArray", { field: "sections" }));
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
      // undefined = not sent (left as it is); see hidingAfter.
      hidden: typeof s.hidden === "boolean" ? s.hidden : undefined,
      movedTo: s.movedTo === null ? null : typeof s.movedTo === "string" && s.movedTo ? s.movedTo : undefined,
      position: data.length,
      size: normalizeSize(s.size),
      height: Number.isInteger(s.height) && s.height >= 120 && s.height <= 2000 ? s.height : null,
    });
  }
  // A built-in shelf may not be renamed to the name of another shelf (a section of their own, or
  // another built-in one), so there are never two shelves with the same name. Only a NEW name is
  // asked: a name a row already has stays, whatever it is.
  const [stored, customs] = await Promise.all([
    prisma.inventorySectionLayout.findMany({ where: { userId: req.userId }, select: { sectionId: true, label: true, hidden: true, movedTo: true } }),
    prisma.pantryLocation.findMany({ where: { userId: req.userId }, select: { id: true, name: true } }),
  ]);
  // Hiding a shelf: never the last one that can hold ingredients, and its items only go to a shelf
  // that is showing. Only what this save changes is judged.
  const hiding = hidingError(new Set(customs.map((c) => c.id)), new Map(stored.map((r) => [r.sectionId, r])), data);
  if (hiding === "lastShelf") return res.status(409).json(fail(req, "lastShelf"));
  if (hiding) return res.status(400).json(fail(req, hiding));
  const after = hidingAfter(new Map(stored.map((r) => [r.sectionId, r])), data);
  const before = new Map(stored.map((r) => [r.sectionId, r.label]));
  for (const row of data) {
    if (!row.label || !Object.hasOwn(BUILT_IN_NAMES, row.sectionId) || row.label === (before.get(row.sectionId) ?? null)) continue;
    const name = normalizeName(row.label);
    const taken =
      customs.some((c) => normalizeName(c.name) === name) ||
      Object.entries(BUILT_IN_NAMES).some(([id, names]) => id !== row.sectionId && names.some((n) => normalizeName(n) === name)) ||
      data.some((other) => other.sectionId !== row.sectionId && Object.hasOwn(BUILT_IN_NAMES, other.sectionId) && other.label && normalizeName(other.label) === name);
    if (taken) return res.status(409).json(fail(req, "sectionExists", { name: row.label }));
  }
  // Upsert row by row (and drop sections no longer listed) rather than
  // delete-all-then-insert: two saves landing together - a rename right
  // before a drag - would otherwise both insert and trip the unique key.
  const save = () =>
    prisma.$transaction(async (tx) => {
      // A hidden shelf's row is never dropped, even by a save that does not list it: it is the
      // shelf, waiting to be brought back.
      await tx.inventorySectionLayout.deleteMany({
        where: { userId: req.userId, hidden: false, sectionId: { notIn: data.map((d) => d.sectionId) } },
      });
      for (const row of data) {
        const { userId, sectionId, hidden, movedTo, ...fields } = row;
        const now = after.get(sectionId);
        // The two fields are only written when this save sent one of them.
        const hideFields = hidden !== undefined || movedTo !== undefined ? { hidden: now.hidden, movedTo: now.movedTo } : {};
        await tx.inventorySectionLayout.upsert({
          where: { userId_sectionId: { userId, sectionId } },
          create: { userId, sectionId, ...fields, hidden: now.hidden, movedTo: now.movedTo },
          update: { ...fields, ...hideFields },
        });
      }
    });
  try {
    await save();
  } catch (err) {
    if (err.code !== "P2002" && err.code !== "P2034") throw err;
    await save(); // the other save won the insert; this one now updates
  }
  const rows = await prisma.inventorySectionLayout.findMany({
    where: { userId: req.userId },
    orderBy: { position: "asc" },
  });
  res.json(rows);
});

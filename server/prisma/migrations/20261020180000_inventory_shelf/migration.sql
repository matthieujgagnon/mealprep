-- WHERE an Inventory item is KEPT (fridge, freezer, pantry: the USDA use-by estimate and shelf
-- life are read from it) and WHICH SHELF it shows on are two things, but both lived in one field,
-- PantryInventoryItem."location". Moving an item to one of the person's own sections replaced
-- "freezer" with the section's id, so the app forgot it was in the freezer.
--
-- This adds the second field and moves nothing else. Add-only, and it DELETES NOTHING:
--   1. "shelf": the shelf the person chose (one of their sections, or a built-in one; null = the
--      default shelf). Every item already on one of their own sections gets that section in "shelf".
--      Its "location" is left exactly as it was, so where it is KEPT stays "not known yet" (the
--      value is not fridge, freezer or pantry) until the person says, in the one-time list the
--      app shows (nothing changes silently). Its use-by date is not touched.
--   2. Matt's « Prepared meals » shelf becomes the built-in "prepared" shelf: the items on a
--      section named like it (case and accents ignored: Prepared meals, Plats préparés...) get
--      the built-in shelf, and its layout row (place, size) moves to the built-in with its name
--      as the label. The old section row is LEFT where it is, now empty; the app offers to
--      delete it (with Undo). Only inserts and updates; no row is deleted.
ALTER TABLE "PantryInventoryItem" ADD COLUMN "shelf" TEXT;

UPDATE "PantryInventoryItem"
SET "shelf" = "location"
WHERE "location" NOT IN ('fridge', 'freezer', 'pantry');

UPDATE "PantryInventoryItem" AS i
SET "shelf" = 'prepared'
FROM "PantryLocation" AS l
WHERE i."userId" = l."userId"
  AND i."shelf" = l."id"
  AND translate(lower(trim(l."name")), 'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc') IN ('prepared meals', 'prepared meal', 'plats prepares', 'plat prepare');

-- One layout row per person moves to the built-in shelf: the first (by position) of their matching sections.
UPDATE "InventorySectionLayout" AS s
SET "sectionId" = 'prepared', "label" = c."name"
FROM (
  SELECT DISTINCT ON (l."userId") l."userId", l."id" AS "locationId", l."name"
  FROM "PantryLocation" AS l
  JOIN "InventorySectionLayout" AS sl ON sl."userId" = l."userId" AND sl."sectionId" = l."id"
  WHERE translate(lower(trim(l."name")), 'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc') IN ('prepared meals', 'prepared meal', 'plats prepares', 'plat prepare')
  ORDER BY l."userId", sl."position", l."id"
) AS c
WHERE s."userId" = c."userId"
  AND s."sectionId" = c."locationId"
  AND NOT EXISTS (
    SELECT 1 FROM "InventorySectionLayout" AS x WHERE x."userId" = s."userId" AND x."sectionId" = 'prepared'
  );

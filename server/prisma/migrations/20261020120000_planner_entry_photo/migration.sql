-- A planned prepared meal (or a hand-typed leftover) is held as a note and has no recipe
-- photo, but the Planner now draws it as a photo card. The photo is read live through the
-- Inventory item the entry is linked to (leftoverItemId); this column keeps a copy of that
-- photo's address only as the fallback for when the item has left Inventory (the last box
-- was eaten) so the card keeps its picture.
-- Add-only: one new nullable column on PlannerEntry, and the copy for entries that already
-- exist is filled from the linked item's photo (the only column this writes is the new one).
ALTER TABLE "PlannerEntry" ADD COLUMN "photoUrl" TEXT;

UPDATE "PlannerEntry" AS e
SET "photoUrl" = i."imageUrl"
FROM "PantryInventoryItem" AS i
WHERE e."leftoverItemId" = i."id"
  AND i."imageUrl" IS NOT NULL
  AND i."imageUrl" <> 'none';

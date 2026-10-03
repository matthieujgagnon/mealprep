-- The grocery list is now one persistent list (every planned meal from today
-- on) instead of one list per week, so its saved state - checks, hand-added
-- items, removals and own amounts - loses its weekStart. Nothing the list
-- still shows is lost on the way:
--   * rows from the current week and later are kept; rows from weeks that
--     ended before this migration belong to meals that are now off the list,
--     so they go (checks and removals there would otherwise mark almost every
--     ingredient as bought or removed forever);
--   * the same item saved in more than one kept week is merged into one row
--     (checked in any week = checked, removed in any week = removed, the most
--     recently set own amount wins);
--   * an item pushed to next week stays on the list as the hand-added item it
--     already was; the original row stays removed, and shows in the Removed
--     strip so it can be put back.
-- "Kept weeks" start on the Monday of the week containing yesterday, so a
-- server clock a few hours ahead of the user's doesn't cut a day too early.

-- Weeks that ended before this one are no longer reachable.
DELETE FROM "GroceryCheckedItem" WHERE "weekStart" < to_char(date_trunc('week', CURRENT_DATE - 1), 'YYYY-MM-DD');
DELETE FROM "GroceryExtraItem" WHERE "weekStart" < to_char(date_trunc('week', CURRENT_DATE - 1), 'YYYY-MM-DD');
DELETE FROM "GroceryItemOverride" WHERE "weekStart" < to_char(date_trunc('week', CURRENT_DATE - 1), 'YYYY-MM-DD');

-- Checked items: one row per item. "Added to Inventory" in any week sticks.
UPDATE "GroceryCheckedItem" c SET "inInventory" = true
WHERE EXISTS (
  SELECT 1 FROM "GroceryCheckedItem" d
  WHERE d."userId" = c."userId" AND d."core" = c."core" AND d."inInventory"
);
DELETE FROM "GroceryCheckedItem" a USING "GroceryCheckedItem" b
WHERE a."userId" = b."userId" AND a."core" = b."core" AND a."id" > b."id";

-- Removals and own amounts: one row per item key. A removed row cleared from
-- the strip ("hidden") stays cleared only if every week's copy was.
UPDATE "GroceryItemOverride" o SET
  "removed" = m."removed",
  "hidden" = m."hidden",
  "quantity" = m."quantity"
FROM (
  SELECT "userId", "key",
    bool_or("removed") AS "removed",
    bool_or("removed") AND bool_and("hidden" OR NOT "removed") AS "hidden",
    (array_agg("quantity" ORDER BY ("quantity" IS NULL), "updatedAt" DESC))[1] AS "quantity"
  FROM "GroceryItemOverride"
  GROUP BY "userId", "key"
) m
WHERE o."userId" = m."userId" AND o."key" = m."key";
DELETE FROM "GroceryItemOverride" a USING "GroceryItemOverride" b
WHERE a."userId" = b."userId" AND a."key" = b."key" AND a."id" > b."id";

-- DropIndex
DROP INDEX "GroceryCheckedItem_userId_weekStart_core_key";

-- DropIndex
DROP INDEX "GroceryExtraItem_userId_weekStart_idx";

-- DropIndex
DROP INDEX "GroceryItemOverride_userId_weekStart_key_key";

-- AlterTable
ALTER TABLE "GroceryCheckedItem" DROP COLUMN "weekStart";

-- AlterTable
ALTER TABLE "GroceryExtraItem" DROP COLUMN "pushedFrom",
DROP COLUMN "pushedKey",
DROP COLUMN "weekStart";

-- AlterTable
ALTER TABLE "GroceryItemOverride" DROP COLUMN "movedTo",
DROP COLUMN "weekStart";

-- CreateIndex
CREATE UNIQUE INDEX "GroceryCheckedItem_userId_core_key" ON "GroceryCheckedItem"("userId", "core");

-- CreateIndex
CREATE INDEX "GroceryExtraItem_userId_idx" ON "GroceryExtraItem"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GroceryItemOverride_userId_key_key" ON "GroceryItemOverride"("userId", "key");

-- "I cooked this" and one leftovers system. Only adds fields; nothing is
-- dropped or renamed.
--
-- Inventory: a LEFTOVER item (portions of a cooked meal, on the Leftovers
-- shelf) and the recipe it came from (none for leftovers added by hand).
ALTER TABLE "PantryInventoryItem" ADD COLUMN "isLeftover" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PantryInventoryItem" ADD COLUMN "recipeId" TEXT;
ALTER TABLE "PantryInventoryItem" ADD CONSTRAINT "PantryInventoryItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Planner: when a meal was cooked (a cooked meal adds nothing to the grocery
-- list), and the Inventory leftovers a planned leftover eats from.
ALTER TABLE "PlannerEntry" ADD COLUMN "cookedAt" TIMESTAMP(3);
ALTER TABLE "PlannerEntry" ADD COLUMN "leftoverItemId" TEXT;

-- Leftovers saved by Cook mode before this change were plain items named
-- "<recipe> (leftovers)" or « <recipe> (restes) ». Mark them as leftovers, so
-- they never count as an ingredient (the old "chicken shawarma (leftovers)"
-- would otherwise read as chicken), and link them to that recipe when one of
-- the same user's recipes has exactly that title.
UPDATE "PantryInventoryItem" SET "isLeftover" = true
  WHERE "name" ~* '\((leftovers|restes)\)\s*$';
UPDATE "PantryInventoryItem" i SET "recipeId" = r."id"
  FROM "Recipe" r
  WHERE i."isLeftover" AND i."recipeId" IS NULL
    AND r."userId" = i."userId"
    AND lower(regexp_replace(i."name", '\s*\((leftovers|restes)\)\s*$', '', 'i')) = lower(r."title");

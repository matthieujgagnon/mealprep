-- Several meal types per recipe, and a « Plat préparé » flag. Add-only: two new columns on
-- "Recipe"; nothing is dropped or renamed, and the old single "mealSlot" stays as it was.
--
-- "mealSlots" is the list of meal types (breakfast, lunch, dinner, side, snack, dessert, prep).
-- Every recipe that had one type keeps it: it becomes a list of one. A recipe that had none
-- gets an empty list (it goes to the "sort your recipes" screen); recipes that only carried
-- the meal as an old tag are still read that way by the app, as before.
-- "isPrepared" is off for every existing recipe, so nothing changes until someone tags one.
-- Both go with the recipe (and its account) like the rest of the row.
ALTER TABLE "Recipe" ADD COLUMN "mealSlots" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Recipe" ADD COLUMN "isPrepared" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Recipe" SET "mealSlots" = ARRAY["mealSlot"] WHERE "mealSlot" IS NOT NULL AND "mealSlot" <> '';

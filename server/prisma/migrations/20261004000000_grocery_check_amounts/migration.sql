-- A check on the grocery list now covers an amount, not just the ingredient:
-- `covered` is what was checked (so a meal added later that needs more shows
-- the extra, unchecked) and `bought` is what "Done shopping" has put in
-- Inventory (those amounts leave the list). Both are null on existing rows:
-- a null `covered` keeps meaning "covers whatever the row needs", and a row
-- with "inInventory" set and no `bought` keeps meaning "everything bought",
-- until the list saves the amounts the next time it opens.

-- AlterTable
ALTER TABLE "GroceryCheckedItem" ADD COLUMN "bought" JSONB,
ADD COLUMN "covered" JSONB;

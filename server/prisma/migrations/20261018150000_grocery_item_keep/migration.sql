-- "Put back on the list" for a grocery row that Inventory already holds. Add-only:
-- one new column, every existing row keeps off (false).
ALTER TABLE "GroceryItemOverride" ADD COLUMN "keep" BOOLEAN NOT NULL DEFAULT false;

-- Grocery: the checkbox has three steps (to buy, bought ✓, queued for
-- Inventory +). Only adds a field; nothing is dropped or renamed.
--
-- queued: true when a checked item is waiting to go into Inventory (the
-- store's "+ Add N to inventory" button). A row is still "checked" exactly as
-- before (its `covered` amount), so every check made before this reads as
-- bought ✓, and everything that reads checks keeps working unchanged.
ALTER TABLE "GroceryCheckedItem" ADD COLUMN "queued" BOOLEAN NOT NULL DEFAULT false;

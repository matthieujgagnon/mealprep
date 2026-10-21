-- Any shelf can be deleted on the Inventory page, and none of it deletes a row. A deleted shelf
-- (a built-in one or one of the person's own) is HIDDEN: its layout row stays, with where its
-- items go while it is gone. Bringing it back flips the flag; its name, place and size are still
-- on the row.
--   "hidden":  the shelf is not drawn. Default false, so every existing row (and every shelf with
--              no row at all) stays visible.
--   "movedTo": while hidden, the shelf whose page its items and new items show on. Nothing is
--              written onto any item: PantryInventoryItem."location" and "shelf" and the use-by
--              dates are exactly as they were. Null = the first shelf that is left.
-- Add-only: two new columns on an existing table, no row is touched or deleted.
ALTER TABLE "InventorySectionLayout" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InventorySectionLayout" ADD COLUMN "movedTo" TEXT;

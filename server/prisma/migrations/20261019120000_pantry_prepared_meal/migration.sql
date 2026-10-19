-- "Prepared meal" on an Inventory item (a frozen lasagna, perogies): a ready-made
-- dish is a meal, not an ingredient, so it never counts as chicken, cheese or pasta
-- and can be planned like leftovers. Add-only: one new column on PantryInventoryItem,
-- every existing row keeps off (false), so nothing changes until someone tags an item.
-- It goes with its account like the rest of the row (ON DELETE CASCADE on userId).
ALTER TABLE "PantryInventoryItem" ADD COLUMN "isPreparedMeal" BOOLEAN NOT NULL DEFAULT false;

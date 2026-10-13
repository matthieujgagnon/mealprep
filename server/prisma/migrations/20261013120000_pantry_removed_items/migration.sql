-- Inventory: "Recently removed" (« Récemment retirés »). Only adds a table;
-- nothing existing is changed, dropped or renamed.
--
-- An item that leaves Inventory (used up, tossed, deleted, or taken out to zero
-- by "I cooked this") is kept here for 7 Quebec days so Put back can restore it
-- under the same id. The Inventory row is still deleted as before, so
-- "PantryInventoryItem" keeps meaning "in stock". Rows go with their user
-- (ON DELETE CASCADE).

-- CreateTable
CREATE TABLE "PantryRemovedItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "item" JSONB NOT NULL,
    "how" TEXT NOT NULL,
    "logId" TEXT,
    "removedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PantryRemovedItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PantryRemovedItem_userId_removedAt_idx" ON "PantryRemovedItem"("userId", "removedAt");

-- AddForeignKey
ALTER TABLE "PantryRemovedItem" ADD CONSTRAINT "PantryRemovedItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

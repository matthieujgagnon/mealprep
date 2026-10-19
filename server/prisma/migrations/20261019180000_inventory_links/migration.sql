-- « Je l'ai comme… » / "I have it as…": names Matt taught the matcher. Only adds a
-- table; nothing existing is changed, dropped or renamed.
--
-- A row says a recipe that names "recipeName" counts as had when Inventory holds an
-- item named "itemName". It adds nothing to Inventory. The names are stored twice:
-- the keys the matcher compares (folded, collapsed) and the labels as they were seen.
-- One link per pair of names per account. Rows go with their user (ON DELETE CASCADE).

-- CreateTable
CREATE TABLE "InventoryLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipeName" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "recipeLabel" TEXT NOT NULL,
    "itemLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryLink_userId_createdAt_idx" ON "InventoryLink"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLink_userId_recipeName_itemName_key" ON "InventoryLink"("userId", "recipeName", "itemName");

-- AddForeignKey
ALTER TABLE "InventoryLink" ADD CONSTRAINT "InventoryLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

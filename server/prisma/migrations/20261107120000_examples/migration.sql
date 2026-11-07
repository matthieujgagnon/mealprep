-- Examples (« Exemple »): every new account starts with example recipes, a planned week and a
-- stocked Inventory, and « Retirer les exemples » removes them in one tap. Add-only: three new
-- yes-or-no columns and one new table; nothing is dropped, renamed or rewritten.
--
-- "isExample" is off for every existing row, so nothing changes for anyone until examples are
-- added to their account. The mark comes off, in the same save, when the person edits, moves,
-- plans or cooks an example; removing the examples only deletes rows that still have it.
ALTER TABLE "Recipe" ADD COLUMN "isExample" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PlannerEntry" ADD COLUMN "isExample" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PantryInventoryItem" ADD COLUMN "isExample" BOOLEAN NOT NULL DEFAULT false;

-- The Undo copy of « Retirer les exemples »: what the removal took, as JSON, one row per account.
-- Replaced by the next removal, deleted by Undo, and deleted with its account.
CREATE TABLE "ExampleRemoval" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "removedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExampleRemoval_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExampleRemoval_userId_key" ON "ExampleRemoval"("userId");

ALTER TABLE "ExampleRemoval" ADD CONSTRAINT "ExampleRemoval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

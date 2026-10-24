-- Matt's changes to the ingredient names table (client/src/lib/ingredientDisplay.txt, which is
-- not changed). Only adds a table; nothing existing is changed, dropped or renamed.
--
-- A row adds an ingredient ("replaces" is null), replaces a built-in row ("replaces" is that
-- row's key) or hides one ("hidden", with no names). Removing a row puts the built-in row back.
-- Only one row may stand in for a built-in row. The rows belong to nobody (they are translations
-- of the app, read by every account and written only by an admin); "updatedById" is who saved it
-- last, and goes to null if that account is deleted.

-- CreateTable
CREATE TABLE "IngredientNameOverride" (
    "id" TEXT NOT NULL,
    "replaces" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "enOne" TEXT NOT NULL DEFAULT '',
    "enOther" TEXT NOT NULL DEFAULT '',
    "frOne" TEXT NOT NULL DEFAULT '',
    "frOther" TEXT NOT NULL DEFAULT '',
    "gender" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "IngredientNameOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IngredientNameOverride_replaces_key" ON "IngredientNameOverride"("replaces");

-- AddForeignKey
ALTER TABLE "IngredientNameOverride" ADD CONSTRAINT "IngredientNameOverride_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

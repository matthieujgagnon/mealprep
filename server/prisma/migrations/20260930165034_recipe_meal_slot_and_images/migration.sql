-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "mealSlot" TEXT;

-- CreateTable
CREATE TABLE "RecipeImage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecipeImage_userId_idx" ON "RecipeImage"("userId");

-- AddForeignKey
ALTER TABLE "RecipeImage" ADD CONSTRAINT "RecipeImage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: recipes already tagged with a meal get that slot. Checked in
-- order so a recipe tagged both "lunch" and "dinner" lands on dinner.
UPDATE "Recipe" SET "mealSlot" = 'dinner' WHERE "mealSlot" IS NULL AND ("tags" ILIKE '%"dinner"%' OR "tags" ILIKE '%"supper"%');
UPDATE "Recipe" SET "mealSlot" = 'lunch' WHERE "mealSlot" IS NULL AND "tags" ILIKE '%"lunch"%';
UPDATE "Recipe" SET "mealSlot" = 'breakfast' WHERE "mealSlot" IS NULL AND "tags" ILIKE '%"breakfast"%';
UPDATE "Recipe" SET "mealSlot" = 'snack' WHERE "mealSlot" IS NULL AND "tags" ILIKE '%"snack"%';

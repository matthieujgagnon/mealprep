-- DropIndex
DROP INDEX "GroceryAssignment_userId_core_idx";

-- DropIndex
DROP INDEX "GroceryCheckedItem_userId_weekStart_core_idx";

-- DropIndex
DROP INDEX "GrocerySection_userId_name_idx";

-- DropIndex
DROP INDEX "PantryStaple_userId_core_idx";

-- DropIndex
DROP INDEX "RecipeCategory_userId_name_idx";

-- CreateIndex
CREATE UNIQUE INDEX "GroceryAssignment_userId_core_key" ON "GroceryAssignment"("userId", "core");

-- CreateIndex
CREATE UNIQUE INDEX "GroceryCheckedItem_userId_weekStart_core_key" ON "GroceryCheckedItem"("userId", "weekStart", "core");

-- CreateIndex
CREATE UNIQUE INDEX "GrocerySection_userId_name_key" ON "GrocerySection"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PantryStaple_userId_core_key" ON "PantryStaple"("userId", "core");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeCategory_userId_name_key" ON "RecipeCategory"("userId", "name");


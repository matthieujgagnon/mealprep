-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "photoUrl" TEXT,
    "photos" TEXT NOT NULL DEFAULT '[]',
    "inCookbook" BOOLEAN NOT NULL DEFAULT false,
    "inImported" BOOLEAN NOT NULL DEFAULT true,
    "isPlaceholder" BOOLEAN NOT NULL DEFAULT false,
    "baseServings" INTEGER NOT NULL DEFAULT 4,
    "prepTimeMinutes" INTEGER,
    "cookTimeMinutes" INTEGER,
    "fridgeLifeDays" INTEGER,
    "instructions" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "group" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PantryStaple" (
    "id" TEXT NOT NULL,
    "core" TEXT NOT NULL,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PantryStaple_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrocerySection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrocerySection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroceryAssignment" (
    "id" TEXT NOT NULL,
    "core" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroceryAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannerEntry" (
    "id" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "mealType" TEXT NOT NULL DEFAULT 'dinner',
    "recipeId" TEXT NOT NULL,
    "servings" INTEGER,
    "isLeftover" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlannerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PantryStaple_core_key" ON "PantryStaple"("core");

-- CreateIndex
CREATE UNIQUE INDEX "GrocerySection_name_key" ON "GrocerySection"("name");

-- CreateIndex
CREATE UNIQUE INDEX "GroceryAssignment_core_key" ON "GroceryAssignment"("core");

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryAssignment" ADD CONSTRAINT "GroceryAssignment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "GrocerySection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerEntry" ADD CONSTRAINT "PlannerEntry_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

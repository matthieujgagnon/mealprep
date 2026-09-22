-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "photoUrl" TEXT,
    "photos" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "inCookbook" BOOLEAN NOT NULL DEFAULT false,
    "inImported" BOOLEAN NOT NULL DEFAULT true,
    "isPlaceholder" BOOLEAN NOT NULL DEFAULT false,
    "baseServings" INTEGER NOT NULL DEFAULT 4,
    "prepTimeMinutes" INTEGER,
    "cookTimeMinutes" INTEGER,
    "fridgeLifeDays" INTEGER,
    "instructions" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "categoryId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
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
    "notes" TEXT,
    "group" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeCategory" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PantryStaple" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "core" TEXT NOT NULL,
    "category" TEXT,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PantryStaple_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrocerySection" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrocerySection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroceryAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "core" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroceryAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroceryCheckedItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "weekStart" TEXT NOT NULL,
    "core" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroceryCheckedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroceryExtraItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "weekStart" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroceryExtraItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlyerDeal" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "store" TEXT NOT NULL,
    "source" TEXT,
    "category" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "matchName" TEXT,
    "price" TEXT NOT NULL,
    "unitPrice" DOUBLE PRECISION,
    "unitBasis" TEXT,
    "validUntil" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlyerDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PantryInventoryItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "core" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "location" TEXT NOT NULL DEFAULT 'fridge',
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PantryInventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "weekStart" TEXT NOT NULL DEFAULT '2026-08-31',
    "dayOfWeek" INTEGER NOT NULL,
    "mealType" TEXT NOT NULL DEFAULT 'dinner',
    "recipeId" TEXT NOT NULL,
    "servings" INTEGER,
    "isLeftover" BOOLEAN NOT NULL DEFAULT false,
    "alreadyHave" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlannerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Recipe_userId_idx" ON "Recipe"("userId");

-- CreateIndex
CREATE INDEX "RecipeCategory_userId_name_idx" ON "RecipeCategory"("userId", "name");

-- CreateIndex
CREATE INDEX "PantryStaple_userId_core_idx" ON "PantryStaple"("userId", "core");

-- CreateIndex
CREATE INDEX "GrocerySection_userId_name_idx" ON "GrocerySection"("userId", "name");

-- CreateIndex
CREATE INDEX "GroceryAssignment_userId_core_idx" ON "GroceryAssignment"("userId", "core");

-- CreateIndex
CREATE INDEX "GroceryCheckedItem_userId_weekStart_core_idx" ON "GroceryCheckedItem"("userId", "weekStart", "core");

-- CreateIndex
CREATE INDEX "GroceryExtraItem_userId_weekStart_idx" ON "GroceryExtraItem"("userId", "weekStart");

-- CreateIndex
CREATE INDEX "FlyerDeal_userId_store_idx" ON "FlyerDeal"("userId", "store");

-- CreateIndex
CREATE INDEX "FlyerDeal_userId_source_idx" ON "FlyerDeal"("userId", "source");

-- CreateIndex
CREATE INDEX "PantryInventoryItem_userId_core_idx" ON "PantryInventoryItem"("userId", "core");

-- CreateIndex
CREATE INDEX "PlannerEntry_userId_weekStart_idx" ON "PlannerEntry"("userId", "weekStart");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "RecipeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeCategory" ADD CONSTRAINT "RecipeCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PantryStaple" ADD CONSTRAINT "PantryStaple_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrocerySection" ADD CONSTRAINT "GrocerySection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryAssignment" ADD CONSTRAINT "GroceryAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryAssignment" ADD CONSTRAINT "GroceryAssignment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "GrocerySection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryCheckedItem" ADD CONSTRAINT "GroceryCheckedItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryExtraItem" ADD CONSTRAINT "GroceryExtraItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlyerDeal" ADD CONSTRAINT "FlyerDeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PantryInventoryItem" ADD CONSTRAINT "PantryInventoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerEntry" ADD CONSTRAINT "PlannerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerEntry" ADD CONSTRAINT "PlannerEntry_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

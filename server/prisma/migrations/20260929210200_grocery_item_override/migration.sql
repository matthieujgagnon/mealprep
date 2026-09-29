-- CreateTable
CREATE TABLE "GroceryItemOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "quantity" TEXT,
    "removed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroceryItemOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroceryItemOverride_userId_weekStart_key_key" ON "GroceryItemOverride"("userId", "weekStart", "key");

-- AddForeignKey
ALTER TABLE "GroceryItemOverride" ADD CONSTRAINT "GroceryItemOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

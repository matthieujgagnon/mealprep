-- CreateTable
CREATE TABLE "InventorySectionLayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "label" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "size" TEXT NOT NULL DEFAULT 'half',

    CONSTRAINT "InventorySectionLayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventorySectionLayout_userId_sectionId_key" ON "InventorySectionLayout"("userId", "sectionId");

-- AddForeignKey
ALTER TABLE "InventorySectionLayout" ADD CONSTRAINT "InventorySectionLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

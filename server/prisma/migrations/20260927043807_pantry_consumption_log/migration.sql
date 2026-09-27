-- CreateTable
CREATE TABLE "PantryConsumptionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "core" TEXT NOT NULL,
    "category" TEXT,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PantryConsumptionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PantryConsumptionLog_userId_createdAt_idx" ON "PantryConsumptionLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "PantryConsumptionLog" ADD CONSTRAINT "PantryConsumptionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


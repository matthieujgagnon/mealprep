-- AlterTable
ALTER TABLE "FlyerDeal" ADD COLUMN     "isCurrent" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "FlyerDeal_userId_isCurrent_idx" ON "FlyerDeal"("userId", "isCurrent");

-- CreateIndex
CREATE INDEX "FlyerDeal_userId_matchName_idx" ON "FlyerDeal"("userId", "matchName");

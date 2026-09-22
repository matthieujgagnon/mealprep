-- AlterTable
ALTER TABLE "FlyerDeal" ADD COLUMN     "imageUrl" TEXT;

-- CreateTable
CREATE TABLE "FlyerUpload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlyerUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FlyerUpload_userId_source_key" ON "FlyerUpload"("userId", "source");

-- AddForeignKey
ALTER TABLE "FlyerUpload" ADD CONSTRAINT "FlyerUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


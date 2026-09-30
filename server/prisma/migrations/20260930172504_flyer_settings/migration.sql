-- CreateTable
CREATE TABLE "FlyerSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL DEFAULT 'H2T2S3',
    "stores" TEXT NOT NULL DEFAULT '["Metro","IGA","Maxi","Super C","Provigo"]',
    "autoImport" BOOLEAN NOT NULL DEFAULT true,
    "lastImportAt" TIMESTAMP(3),
    "lastImportOk" BOOLEAN,
    "lastImportCount" INTEGER,
    "lastImportSource" TEXT,
    "lastImportMessage" TEXT,
    "lastSuccessAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlyerSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FlyerSettings_userId_key" ON "FlyerSettings"("userId");

-- AddForeignKey
ALTER TABLE "FlyerSettings" ADD CONSTRAINT "FlyerSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

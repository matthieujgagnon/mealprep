-- CreateTable
CREATE TABLE "PriceBaseline" (
    "id" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "unitBasis" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "month" TEXT NOT NULL,
    "history" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PriceBaseline_product_key" ON "PriceBaseline"("product");

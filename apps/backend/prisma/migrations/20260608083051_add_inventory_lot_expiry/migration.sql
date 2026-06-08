-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'OUT_EXPIRED';

-- AlterTable
ALTER TABLE "StockTransaction" ADD COLUMN     "lotId" TEXT;

-- CreateTable
CREATE TABLE "InventoryLot" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receiptNo" TEXT,
    "donorName" TEXT,
    "unitCost" DOUBLE PRECISION,
    "actorId" TEXT NOT NULL,
    "isExpired" BOOLEAN NOT NULL DEFAULT false,
    "expiredAt" TIMESTAMP(3),
    "expiredById" TEXT,

    CONSTRAINT "InventoryLot_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "InventoryLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_expiredById_fkey" FOREIGN KEY ("expiredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "discoveryCallAt" TIMESTAMP(3),
ADD COLUMN     "discoveryCallEndAt" TIMESTAMP(3),
ADD COLUMN     "discoveryCallToken" TEXT,
ADD COLUMN     "discoveryCallStatus" TEXT,
ADD COLUMN     "discoveryCallVideoUrl" TEXT,
ADD COLUMN     "discoveryRepEmail" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Deal_discoveryCallToken_key" ON "Deal"("discoveryCallToken");

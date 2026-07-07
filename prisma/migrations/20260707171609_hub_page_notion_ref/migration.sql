-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "notionPageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Page_notionPageId_key" ON "Page"("notionPageId");


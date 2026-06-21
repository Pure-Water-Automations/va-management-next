-- AlterEnum
ALTER TYPE "RecordingVisibility" ADD VALUE 'client';

-- AlterTable
ALTER TABLE "Recording" ADD COLUMN     "clientOrganizationId" TEXT;

-- CreateIndex
CREATE INDEX "Recording_clientOrganizationId_idx" ON "Recording"("clientOrganizationId");

-- AddForeignKey
ALTER TABLE "Recording" ADD CONSTRAINT "Recording_clientOrganizationId_fkey" FOREIGN KEY ("clientOrganizationId") REFERENCES "ClientOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "MeetingAction" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "MeetingAction_archivedAt_idx" ON "MeetingAction"("archivedAt");


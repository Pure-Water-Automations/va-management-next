-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'manual';

-- CreateTable
CREATE TABLE "ScratchItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "promotedTaskId" TEXT,
    "clientTaskRequestId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScratchItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScratchItem_promotedTaskId_key" ON "ScratchItem"("promotedTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "ScratchItem_clientTaskRequestId_key" ON "ScratchItem"("clientTaskRequestId");

-- CreateIndex
CREATE INDEX "ScratchItem_projectId_idx" ON "ScratchItem"("projectId");

-- AddForeignKey
ALTER TABLE "ScratchItem" ADD CONSTRAINT "ScratchItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill provenance for tasks created from confirmed meeting action items.
UPDATE "Task" SET "source" = 'meeting'
WHERE "id" IN (SELECT "taskId" FROM "MeetingActionItem" WHERE "taskId" IS NOT NULL);

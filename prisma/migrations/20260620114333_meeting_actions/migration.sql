-- CreateEnum
CREATE TYPE "MeetingActionStatus" AS ENUM ('PENDING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "MeetingActionItemStatus" AS ENUM ('PENDING', 'CONFIRMED', 'SKIPPED');

-- CreateTable
CREATE TABLE "MeetingAction" (
    "id" TEXT NOT NULL,
    "meetingFile" TEXT NOT NULL,
    "meetingTitle" TEXT NOT NULL,
    "meetingDate" TIMESTAMP(3),
    "zoomAccount" TEXT,
    "status" "MeetingActionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingActionItem" (
    "id" TEXT NOT NULL,
    "meetingActionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "suggestedAssignee" TEXT,
    "suggestedDueDate" TIMESTAMP(3),
    "clientContext" TEXT,
    "status" "MeetingActionItemStatus" NOT NULL DEFAULT 'PENDING',
    "taskId" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetingAction_meetingFile_key" ON "MeetingAction"("meetingFile");

-- CreateIndex
CREATE INDEX "MeetingAction_status_idx" ON "MeetingAction"("status");

-- CreateIndex
CREATE INDEX "MeetingActionItem_meetingActionId_idx" ON "MeetingActionItem"("meetingActionId");

-- CreateIndex
CREATE INDEX "MeetingActionItem_status_idx" ON "MeetingActionItem"("status");

-- AddForeignKey
ALTER TABLE "MeetingActionItem" ADD CONSTRAINT "MeetingActionItem_meetingActionId_fkey" FOREIGN KEY ("meetingActionId") REFERENCES "MeetingAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

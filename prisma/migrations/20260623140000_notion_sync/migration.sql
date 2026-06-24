-- Notion two-way sync (beta): per-client-org connection + linked-page fields on Project/Task.

-- AlterTable: Project
ALTER TABLE "Project" ADD COLUMN "notionPageId" TEXT;
ALTER TABLE "Project" ADD COLUMN "notionUrl" TEXT;
ALTER TABLE "Project" ADD COLUMN "notionStatus" TEXT;
ALTER TABLE "Project" ADD COLUMN "notionSyncedAt" TIMESTAMP(3);

-- AlterTable: Task
ALTER TABLE "Task" ADD COLUMN "notionPageId" TEXT;
ALTER TABLE "Task" ADD COLUMN "notionUrl" TEXT;
ALTER TABLE "Task" ADD COLUMN "notionStatus" TEXT;
ALTER TABLE "Task" ADD COLUMN "notionSyncedAt" TIMESTAMP(3);

-- CreateTable: NotionConnection
CREATE TABLE "NotionConnection" (
    "id" TEXT NOT NULL,
    "clientOrganizationId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "projectsDatabaseId" TEXT,
    "projectsDataSourceId" TEXT,
    "tasksDatabaseId" TEXT,
    "tasksDataSourceId" TEXT,
    "statusProperty" TEXT NOT NULL DEFAULT 'Status',
    "statusMap" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByEmail" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastEditedCursor" TEXT,
    "lastSyncSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotionConnection_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "Project_notionPageId_key" ON "Project"("notionPageId");
CREATE UNIQUE INDEX "Task_notionPageId_key" ON "Task"("notionPageId");
CREATE UNIQUE INDEX "NotionConnection_clientOrganizationId_key" ON "NotionConnection"("clientOrganizationId");
CREATE INDEX "NotionConnection_active_idx" ON "NotionConnection"("active");

-- ForeignKey
ALTER TABLE "NotionConnection" ADD CONSTRAINT "NotionConnection_clientOrganizationId_fkey" FOREIGN KEY ("clientOrganizationId") REFERENCES "ClientOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

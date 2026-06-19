-- CreateEnum
CREATE TYPE "ClientOrgStatus" AS ENUM ('active', 'paused', 'churned');

-- CreateEnum
CREATE TYPE "ClientTaskRequestStatus" AS ENUM ('RECEIVED', 'TRIAGE_NEEDED', 'READY_TO_ASSIGN', 'ASSIGNED', 'DECLINED');

-- CreateEnum
CREATE TYPE "CommentVisibility" AS ENUM ('INTERNAL_ONLY', 'CLIENT_VISIBLE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'CLIENT_ADMIN';
ALTER TYPE "Role" ADD VALUE 'CLIENT_MEMBER';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "clientOrganizationId" TEXT;

-- AlterTable
ALTER TABLE "ProjectComment" ADD COLUMN     "visibility" "CommentVisibility" NOT NULL DEFAULT 'INTERNAL_ONLY';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "clientOrganizationId" TEXT;

-- AlterTable
ALTER TABLE "TaskComment" ADD COLUMN     "visibility" "CommentVisibility" NOT NULL DEFAULT 'INTERNAL_ONLY';

-- CreateTable
CREATE TABLE "ClientOrganization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "notionId" TEXT,
    "status" "ClientOrgStatus" NOT NULL DEFAULT 'active',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientOrganizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientTaskRequest" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priorityPreference" "Priority" NOT NULL DEFAULT 'Medium',
    "dueDatePreference" TIMESTAMP(3),
    "fileReference" TEXT,
    "status" "ClientTaskRequestStatus" NOT NULL DEFAULT 'RECEIVED',
    "submittedById" TEXT NOT NULL,
    "clientOrganizationId" TEXT NOT NULL,
    "assignedTaskId" TEXT,
    "declineReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientTaskRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientOrganization_slug_key" ON "ClientOrganization"("slug");

-- CreateIndex
CREATE INDEX "ClientOrganization_slug_idx" ON "ClientOrganization"("slug");

-- CreateIndex
CREATE INDEX "ClientOrganization_active_idx" ON "ClientOrganization"("active");

-- CreateIndex
CREATE INDEX "ClientMembership_userId_idx" ON "ClientMembership"("userId");

-- CreateIndex
CREATE INDEX "ClientMembership_clientOrganizationId_idx" ON "ClientMembership"("clientOrganizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientMembership_userId_clientOrganizationId_key" ON "ClientMembership"("userId", "clientOrganizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientTaskRequest_assignedTaskId_key" ON "ClientTaskRequest"("assignedTaskId");

-- CreateIndex
CREATE INDEX "ClientTaskRequest_clientOrganizationId_idx" ON "ClientTaskRequest"("clientOrganizationId");

-- CreateIndex
CREATE INDEX "ClientTaskRequest_status_idx" ON "ClientTaskRequest"("status");

-- CreateIndex
CREATE INDEX "ClientTaskRequest_submittedById_idx" ON "ClientTaskRequest"("submittedById");

-- CreateIndex
CREATE INDEX "Project_clientOrganizationId_idx" ON "Project"("clientOrganizationId");

-- CreateIndex
CREATE INDEX "ProjectComment_visibility_idx" ON "ProjectComment"("visibility");

-- CreateIndex
CREATE INDEX "Task_clientOrganizationId_idx" ON "Task"("clientOrganizationId");

-- CreateIndex
CREATE INDEX "TaskComment_visibility_idx" ON "TaskComment"("visibility");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientOrganizationId_fkey" FOREIGN KEY ("clientOrganizationId") REFERENCES "ClientOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clientOrganizationId_fkey" FOREIGN KEY ("clientOrganizationId") REFERENCES "ClientOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientMembership" ADD CONSTRAINT "ClientMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientMembership" ADD CONSTRAINT "ClientMembership_clientOrganizationId_fkey" FOREIGN KEY ("clientOrganizationId") REFERENCES "ClientOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientTaskRequest" ADD CONSTRAINT "ClientTaskRequest_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientTaskRequest" ADD CONSTRAINT "ClientTaskRequest_clientOrganizationId_fkey" FOREIGN KEY ("clientOrganizationId") REFERENCES "ClientOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientTaskRequest" ADD CONSTRAINT "ClientTaskRequest_assignedTaskId_fkey" FOREIGN KEY ("assignedTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('TEXT', 'SELECT', 'DATE', 'PERSON');

-- CreateTable
CREATE TABLE "FieldDef" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "type" "FieldType" NOT NULL DEFAULT 'TEXT',
    "options" JSONB,
    "clientVisible" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldValue" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "taskId" TEXT,
    "projectId" TEXT,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FieldDef_projectId_idx" ON "FieldDef"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "FieldDef_projectId_name_key" ON "FieldDef"("projectId", "name");

-- CreateIndex
CREATE INDEX "FieldValue_taskId_idx" ON "FieldValue"("taskId");

-- CreateIndex
CREATE INDEX "FieldValue_projectId_idx" ON "FieldValue"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "FieldValue_fieldId_taskId_key" ON "FieldValue"("fieldId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "FieldValue_fieldId_projectId_key" ON "FieldValue"("fieldId", "projectId");

-- AddForeignKey
ALTER TABLE "FieldDef" ADD CONSTRAINT "FieldDef_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldValue" ADD CONSTRAINT "FieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "FieldDef"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldValue" ADD CONSTRAINT "FieldValue_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldValue" ADD CONSTRAINT "FieldValue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;


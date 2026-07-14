-- CreateTable
CREATE TABLE "ProjectWhiteboard" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Untitled board',
    "data" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectWhiteboard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectWhiteboard_projectId_idx" ON "ProjectWhiteboard"("projectId");

-- AddForeignKey
ALTER TABLE "ProjectWhiteboard" ADD CONSTRAINT "ProjectWhiteboard_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectWhiteboard" ADD CONSTRAINT "ProjectWhiteboard_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

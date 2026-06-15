-- AlterTable
ALTER TABLE "TrainingAssignment" ADD COLUMN     "estMinutes" INTEGER,
ADD COLUMN     "skill" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "TrainingSession" ADD COLUMN     "assignmentId" TEXT;

-- CreateTable
CREATE TABLE "TrainingTaskProgress" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "minutesSpent" INTEGER NOT NULL DEFAULT 0,
    "outputLink" TEXT,
    "note" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingTaskProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingTaskProgress_candidateId_idx" ON "TrainingTaskProgress"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingTaskProgress_candidateId_assignmentId_key" ON "TrainingTaskProgress"("candidateId", "assignmentId");

-- AddForeignKey
ALTER TABLE "TrainingTaskProgress" ADD CONSTRAINT "TrainingTaskProgress_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("candidateId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingTaskProgress" ADD CONSTRAINT "TrainingTaskProgress_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "TrainingAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

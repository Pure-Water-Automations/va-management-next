-- CreateEnum
CREATE TYPE "EvalRubric" AS ENUM ('TRAINEE', 'TIER');

-- CreateEnum
CREATE TYPE "EvalStatus" AS ENUM ('forms_sent', 'self_submitted', 'supervisor_submitted', 'ready_for_review', 'approved', 'declined');

-- CreateTable
CREATE TABLE "Evaluation" (
    "evaluationId" TEXT NOT NULL,
    "tierReviewId" TEXT NOT NULL,
    "vaId" TEXT NOT NULL,
    "vaName" TEXT,
    "rubric" "EvalRubric" NOT NULL DEFAULT 'TRAINEE',
    "stage" TEXT,
    "status" "EvalStatus" NOT NULL DEFAULT 'forms_sent',
    "supervisorVaId" TEXT,
    "selfSubmittedAt" TIMESTAMP(3),
    "selfScore" DOUBLE PRECISION,
    "selfJson" JSONB,
    "supervisorSubmittedAt" TIMESTAMP(3),
    "supervisorScore" DOUBLE PRECISION,
    "supervisorRecommendation" TEXT,
    "supervisorJson" JSONB,
    "combinedScore" DOUBLE PRECISION,
    "autoRecommendation" TEXT,
    "hrNotes" TEXT,
    "decision" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evaluation_pkey" PRIMARY KEY ("evaluationId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Evaluation_tierReviewId_key" ON "Evaluation"("tierReviewId");

-- CreateIndex
CREATE INDEX "Evaluation_vaId_idx" ON "Evaluation"("vaId");

-- CreateIndex
CREATE INDEX "Evaluation_status_idx" ON "Evaluation"("status");

-- CreateIndex
CREATE INDEX "Evaluation_supervisorVaId_idx" ON "Evaluation"("supervisorVaId");

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_tierReviewId_fkey" FOREIGN KEY ("tierReviewId") REFERENCES "TierReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_vaId_fkey" FOREIGN KEY ("vaId") REFERENCES "Va"("vaId") ON DELETE RESTRICT ON UPDATE CASCADE;

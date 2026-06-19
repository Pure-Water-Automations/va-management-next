-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "screenFlags" JSONB,
ADD COLUMN     "screenScore" INTEGER,
ADD COLUMN     "screenSummary" TEXT,
ADD COLUMN     "screenVerdict" TEXT,
ADD COLUMN     "screenedAt" TIMESTAMP(3);

-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('uploading', 'processing', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "RecordingVisibility" AS ENUM ('private', 'internal', 'link');

-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "tenhrRecordingId" TEXT;

-- CreateTable
CREATE TABLE "Recording" (
    "id" TEXT NOT NULL,
    "vaId" TEXT,
    "candidateId" TEXT,
    "uploaderUserId" TEXT,
    "uploaderEmail" TEXT,
    "title" TEXT NOT NULL DEFAULT 'Untitled recording',
    "description" TEXT,
    "status" "RecordingStatus" NOT NULL DEFAULT 'uploading',
    "visibility" "RecordingVisibility" NOT NULL DEFAULT 'internal',
    "shareToken" TEXT,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'video/webm',
    "sizeBytes" INTEGER,
    "durationSec" DOUBLE PRECISION,
    "thumbnailKey" TEXT,
    "transcriptKey" TEXT,
    "project" TEXT,
    "task" TEXT,
    "transcript" TEXT,
    "transcriptJson" JSONB,
    "aiTitle" TEXT,
    "aiSummary" TEXT,
    "aiStatus" TEXT,
    "reviewStatus" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "uploadedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),

    CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordingComment" (
    "id" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "authorEmail" TEXT,
    "authorName" TEXT,
    "body" TEXT,
    "reaction" TEXT,
    "timestampSec" DOUBLE PRECISION,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordingComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Recording_shareToken_key" ON "Recording"("shareToken");

-- CreateIndex
CREATE UNIQUE INDEX "Recording_objectKey_key" ON "Recording"("objectKey");

-- CreateIndex
CREATE INDEX "Recording_vaId_idx" ON "Recording"("vaId");

-- CreateIndex
CREATE INDEX "Recording_candidateId_idx" ON "Recording"("candidateId");

-- CreateIndex
CREATE INDEX "Recording_status_idx" ON "Recording"("status");

-- CreateIndex
CREATE INDEX "Recording_uploaderUserId_idx" ON "Recording"("uploaderUserId");

-- CreateIndex
CREATE INDEX "RecordingComment_recordingId_idx" ON "RecordingComment"("recordingId");

-- AddForeignKey
ALTER TABLE "Recording" ADD CONSTRAINT "Recording_vaId_fkey" FOREIGN KEY ("vaId") REFERENCES "Va"("vaId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recording" ADD CONSTRAINT "Recording_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("candidateId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingComment" ADD CONSTRAINT "RecordingComment_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "Recording"("id") ON DELETE CASCADE ON UPDATE CASCADE;

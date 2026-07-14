-- Zoom Meeting App Phase 2 (live RTMS capture).
-- New ZoomCaptureStatus value for joined-and-streaming sessions, plus per-item
-- live-capture provenance columns on MeetingActionItem (all nullable/additive).

-- AlterEnum
ALTER TYPE "ZoomCaptureStatus" ADD VALUE IF NOT EXISTS 'LIVE';

-- AlterTable
ALTER TABLE "MeetingActionItem" ADD COLUMN "kind" TEXT;
ALTER TABLE "MeetingActionItem" ADD COLUMN "confidence" DOUBLE PRECISION;
ALTER TABLE "MeetingActionItem" ADD COLUMN "evidenceQuote" TEXT;
ALTER TABLE "MeetingActionItem" ADD COLUMN "skipReason" TEXT;
ALTER TABLE "MeetingActionItem" ADD COLUMN "liveVotes" JSONB;

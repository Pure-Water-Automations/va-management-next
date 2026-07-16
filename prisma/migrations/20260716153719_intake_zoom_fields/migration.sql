-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "attachmentKeys" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "discoveryZoomMeetingId" TEXT;


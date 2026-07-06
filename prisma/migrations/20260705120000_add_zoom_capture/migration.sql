-- CreateEnum
CREATE TYPE "ZoomCaptureSource" AS ENUM ('RECORDING', 'RTMS');

-- CreateEnum
CREATE TYPE "ZoomCaptureStatus" AS ENUM ('PENDING', 'PROCESSED', 'SKIPPED', 'FAILED');

-- AlterTable
ALTER TABLE "MeetingAction" ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "ZoomConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "zoomUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiry" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZoomConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZoomMeetingCapture" (
    "id" TEXT NOT NULL,
    "meetingUuid" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "hostZoomId" TEXT NOT NULL,
    "source" "ZoomCaptureSource" NOT NULL DEFAULT 'RECORDING',
    "status" "ZoomCaptureStatus" NOT NULL DEFAULT 'PENDING',
    "meetingActionId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "ZoomMeetingCapture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ZoomConnection_zoomUserId_key" ON "ZoomConnection"("zoomUserId");

-- CreateIndex
CREATE INDEX "ZoomConnection_userId_idx" ON "ZoomConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ZoomMeetingCapture_meetingUuid_key" ON "ZoomMeetingCapture"("meetingUuid");

-- CreateIndex
CREATE INDEX "ZoomMeetingCapture_status_idx" ON "ZoomMeetingCapture"("status");

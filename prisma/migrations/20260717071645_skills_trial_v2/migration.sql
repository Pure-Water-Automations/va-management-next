-- CreateEnum
CREATE TYPE "TrialStatus" AS ENUM ('ACTIVE', 'SUBMITTED', 'REVISION', 'COMPLETED');

-- CreateEnum
CREATE TYPE "MissionStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'NEEDS_REVISION', 'APPROVED');

-- CreateTable
CREATE TABLE "TrialProgramVersion" (
    "id" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'V2 Simulated Work Week',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrialProgramVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionTemplate" (
    "id" TEXT NOT NULL,
    "programVersionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "kindLabel" TEXT NOT NULL,
    "estMinutes" INTEGER NOT NULL,
    "dayDue" INTEGER NOT NULL,
    "clientName" TEXT NOT NULL,
    "story" TEXT NOT NULL,
    "deliverableText" TEXT NOT NULL,
    "instructionsText" TEXT NOT NULL,
    "contentJson" JSONB,

    CONSTRAINT "MissionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateTrial" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "programVersionId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineDate" TIMESTAMP(3) NOT NULL,
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "status" "TrialStatus" NOT NULL DEFAULT 'ACTIVE',
    "timezone" TEXT NOT NULL DEFAULT 'GMT+8',
    "declaredDays" TEXT NOT NULL DEFAULT 'Mon,Tue,Wed,Thu,Fri',
    "declaredBlock" TEXT NOT NULL DEFAULT 'Morning',
    "specializationTrack" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "accommodationsActive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CandidateTrial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateMission" (
    "id" TEXT NOT NULL,
    "trialId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" "MissionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "secondsSpent" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "timerStartedAt" TIMESTAMP(3),
    "submittedText1" TEXT,
    "submittedText2" TEXT,
    "submittedLink" TEXT,
    "revisionPlan" TEXT,
    "initialText1" TEXT,
    "initialText2" TEXT,
    "initialLink" TEXT,
    "feedbackJson" JSONB,

    CONSTRAINT "CandidateMission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrialEvent" (
    "id" TEXT NOT NULL,
    "trialId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "day" INTEGER NOT NULL,
    "actor" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dataJson" JSONB,

    CONSTRAINT "TrialEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrialConversation" (
    "id" TEXT NOT NULL,
    "trialId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,

    CONSTRAINT "TrialConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrialMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "day" INTEGER NOT NULL,
    "from" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "tag" TEXT,

    CONSTRAINT "TrialMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrialProgramVersion_versionNumber_key" ON "TrialProgramVersion"("versionNumber");

-- CreateIndex
CREATE INDEX "MissionTemplate_programVersionId_idx" ON "MissionTemplate"("programVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateTrial_candidateId_key" ON "CandidateTrial"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateTrial_status_idx" ON "CandidateTrial"("status");

-- CreateIndex
CREATE INDEX "CandidateMission_trialId_idx" ON "CandidateMission"("trialId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateMission_trialId_templateId_key" ON "CandidateMission"("trialId", "templateId");

-- CreateIndex
CREATE INDEX "TrialEvent_trialId_timestamp_idx" ON "TrialEvent"("trialId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "TrialConversation_trialId_actorType_key" ON "TrialConversation"("trialId", "actorType");

-- CreateIndex
CREATE INDEX "TrialMessage_conversationId_timestamp_idx" ON "TrialMessage"("conversationId", "timestamp");

-- AddForeignKey
ALTER TABLE "MissionTemplate" ADD CONSTRAINT "MissionTemplate_programVersionId_fkey" FOREIGN KEY ("programVersionId") REFERENCES "TrialProgramVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateTrial" ADD CONSTRAINT "CandidateTrial_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("candidateId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateTrial" ADD CONSTRAINT "CandidateTrial_programVersionId_fkey" FOREIGN KEY ("programVersionId") REFERENCES "TrialProgramVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateMission" ADD CONSTRAINT "CandidateMission_trialId_fkey" FOREIGN KEY ("trialId") REFERENCES "CandidateTrial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateMission" ADD CONSTRAINT "CandidateMission_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MissionTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrialEvent" ADD CONSTRAINT "TrialEvent_trialId_fkey" FOREIGN KEY ("trialId") REFERENCES "CandidateTrial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrialConversation" ADD CONSTRAINT "TrialConversation_trialId_fkey" FOREIGN KEY ("trialId") REFERENCES "CandidateTrial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrialMessage" ADD CONSTRAINT "TrialMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "TrialConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;


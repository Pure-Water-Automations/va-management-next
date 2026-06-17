-- CreateEnum
CREATE TYPE "Role" AS ENUM ('HR_MANAGER', 'PEOPLE_OPS', 'TEAM_LEAD', 'BOOKKEEPER', 'RECRUITER', 'SENIOR_VA', 'VA');

-- CreateEnum
CREATE TYPE "CompRole" AS ENUM ('TRAINEE', 'TIER_1', 'TIER_2', 'TIER_3', 'TIER_4');

-- CreateEnum
CREATE TYPE "VaStatus" AS ENUM ('active', 'training', 'departed');

-- CreateEnum
CREATE TYPE "CompensationType" AS ENUM ('hourly', 'salary');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('open', 'closed', 'paid');

-- CreateEnum
CREATE TYPE "TierReviewStatus" AS ENUM ('hours_triggered', 'form_sent', 'under_review', 'approved', 'declined');

-- CreateEnum
CREATE TYPE "CandidateStage" AS ENUM ('applied', 'reviewed', 'interview_scheduled', 'interviewed', 'decision', 'tenhr_invited', 'tenhr_in_progress', 'tenhr_pass', 'tenhr_fail', 'contract_sent', 'signed', 'onboarding', 'closed');

-- CreateEnum
CREATE TYPE "RecruiterRecommendation" AS ENUM ('recommend_hire', 'consider', 'pass', 'on_waitlist');

-- CreateEnum
CREATE TYPE "FinalDecision" AS ENUM ('invite_tenhr', 'waitlist', 'reject');

-- CreateEnum
CREATE TYPE "GateResult" AS ENUM ('pass', 'fail', 'pending');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('awaiting_send', 'viewed', 'sent', 'signed', 'completed');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('active', 'completed', 'rejected', 'void');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('needs_review', 'approved', 'question', 'rejected', 'void');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('pending', 'in_progress', 'completed');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "vaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Va" (
    "vaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "compensationRole" "CompRole" NOT NULL DEFAULT 'TRAINEE',
    "status" "VaStatus" NOT NULL DEFAULT 'training',
    "targetHoursWeekly" DOUBLE PRECISION,
    "supervisorVaId" TEXT,
    "desklogUserId" TEXT,
    "skillSpecs" TEXT,
    "availabilityNotes" TEXT,
    "lastCheckinDate" TIMESTAMP(3),
    "notionProfileUrl" TEXT,
    "roleStartedDate" TIMESTAMP(3),
    "notionDisplayTier" TEXT,
    "tierMismatchFlag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Va_pkey" PRIMARY KEY ("vaId")
);

-- CreateTable
CREATE TABLE "CompensationRole" (
    "roleId" "CompRole" NOT NULL,
    "roleName" TEXT NOT NULL,
    "compensationType" "CompensationType" NOT NULL DEFAULT 'hourly',
    "hourlyRate" DOUBLE PRECISION,
    "salaryPerPeriod" DOUBLE PRECISION,
    "onAdvancementTrack" BOOLEAN NOT NULL DEFAULT true,
    "minTotalHoursToReachNext" DOUBLE PRECISION,
    "nextRoleId" "CompRole",
    "additionalRequirements" TEXT,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompensationRole_pkey" PRIMARY KEY ("roleId")
);

-- CreateTable
CREATE TABLE "DeskLogHours" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "vaId" TEXT NOT NULL,
    "desklogUserId" TEXT,
    "project" TEXT,
    "task" TEXT,
    "billable" BOOLEAN,
    "timeAtWorkHrs" DOUBLE PRECISION,
    "focusTimeHrs" DOUBLE PRECISION,
    "idleTimeHrs" DOUBLE PRECISION,
    "taskSpentHrs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taskAssignedHrs" DOUBLE PRECISION,
    "payRule" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeskLogHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeskLogEfficiency" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "vaId" TEXT NOT NULL,
    "desklogUserId" TEXT,
    "activityPct" DOUBLE PRECISION,
    "efficiencyPct" DOUBLE PRECISION,
    "productiveTimeHrs" DOUBLE PRECISION,
    "focusTimeHrs" DOUBLE PRECISION,
    "idleTimeHrs" DOUBLE PRECISION,
    "nonProductiveTimeHrs" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeskLogEfficiency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapacityFlagEvent" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vaId" TEXT NOT NULL,
    "vaName" TEXT,
    "flagType" TEXT NOT NULL,
    "transition" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "supervisorVaId" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "CapacityFlagEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "closeDate" DATE NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'open',
    "periodTotalHours" DOUBLE PRECISION,
    "periodTotalPayroll" DOUBLE PRECISION,
    "reminder3dSentAt" TIMESTAMP(3),
    "reminder1dSentAt" TIMESTAMP(3),
    "bookkeeperEmailSentAt" TIMESTAMP(3),

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("periodStart")
);

-- CreateTable
CREATE TABLE "PayrollCalculation" (
    "id" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "vaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "compensationRole" "CompRole" NOT NULL,
    "compensationType" "CompensationType" NOT NULL,
    "hoursInPeriod" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hourlyRate" DOUBLE PRECISION,
    "salaryPerPeriod" DOUBLE PRECISION,
    "grossPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TierReview" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vaId" TEXT NOT NULL,
    "vaName" TEXT,
    "currentRole" "CompRole",
    "targetRole" "CompRole",
    "cumulativeHoursAtTrigger" DOUBLE PRECISION,
    "status" "TierReviewStatus" NOT NULL DEFAULT 'hours_triggered',
    "skillAttestationFormUrl" TEXT,
    "hrDecisionDate" TIMESTAMP(3),
    "hrNotes" TEXT,

    CONSTRAINT "TierReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "candidateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdated" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "country" TEXT,
    "resumeUrl" TEXT,
    "skillsRoleTags" TEXT,
    "currentStage" "CandidateStage" NOT NULL DEFAULT 'applied',
    "aiSkillScore" DOUBLE PRECISION,
    "commScore" DOUBLE PRECISION,
    "reliabilityScore" DOUBLE PRECISION,
    "ownershipScore" DOUBLE PRECISION,
    "skillFitScore" DOUBLE PRECISION,
    "interviewerEmail" TEXT,
    "interviewDate" TIMESTAMP(3),
    "interviewNotes" TEXT,
    "recruiterRecommendation" "RecruiterRecommendation",
    "finalDecision" "FinalDecision",
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "tenhrAssignmentTitle" TEXT,
    "tenhrAssignmentLink" TEXT,
    "tenhrResultUrl" TEXT,
    "tenhrLoomUrl" TEXT,
    "tenhrQuizScore" DOUBLE PRECISION,
    "tenhrDeadline" TIMESTAMP(3),
    "tenhrGateResult" "GateResult",
    "gateReviewedBy" TEXT,
    "contractSentAt" TIMESTAMP(3),
    "contractStatus" "ContractStatus",
    "contractDeadline" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "bunnydocRequestId" TEXT,
    "vaId" TEXT,
    "notionPageId" TEXT,
    "followUpNotes" TEXT,
    "trainingAccessToken" TEXT,
    "trainingTotalMinutes" INTEGER NOT NULL DEFAULT 0,
    "trainingSessionCount" INTEGER NOT NULL DEFAULT 0,
    "trainingLastSessionAt" TIMESTAMP(3),
    "trainingReadyForReview" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("candidateId")
);

-- CreateTable
CREATE TABLE "TrainingSession" (
    "sessionId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "candidateEmail" TEXT,
    "candidateName" TEXT,
    "assignmentTitle" TEXT,
    "assignmentLink" TEXT,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "status" "SessionStatus" NOT NULL DEFAULT 'active',
    "workNotes" TEXT,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'needs_review',
    "reviewNotes" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "TrainingAssignment" (
    "id" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "instructions" TEXT,
    "instructionsLink" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Onboarding" (
    "onboardingId" TEXT NOT NULL,
    "vaId" TEXT NOT NULL,
    "vaName" TEXT,
    "signedAt" TIMESTAMP(3),
    "status" "OnboardingStatus" NOT NULL DEFAULT 'pending',
    "gmailCreated" BOOLEAN NOT NULL DEFAULT false,
    "desklogCreated" BOOLEAN NOT NULL DEFAULT false,
    "whatsappAdded" BOOLEAN NOT NULL DEFAULT false,
    "contractUploaded" BOOLEAN NOT NULL DEFAULT false,
    "ndaUploaded" BOOLEAN NOT NULL DEFAULT false,
    "taxFormType" TEXT,
    "taxFormDone" BOOLEAN NOT NULL DEFAULT false,
    "paymentMethod" TEXT,
    "paymentFormDone" BOOLEAN NOT NULL DEFAULT false,
    "headshotUploaded" BOOLEAN NOT NULL DEFAULT false,
    "handbookAck" BOOLEAN NOT NULL DEFAULT false,
    "notionOnboardingPageId" TEXT,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Onboarding_pkey" PRIMARY KEY ("onboardingId")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Policy" (
    "key" TEXT NOT NULL,
    "value" TEXT,
    "status" TEXT,
    "owner" TEXT,
    "source" TEXT,
    "notes" TEXT,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "NotionRef" (
    "refId" TEXT NOT NULL,
    "refType" TEXT,
    "name" TEXT,
    "relatedRoleId" TEXT,
    "relatedVaId" TEXT,
    "notionUrl" TEXT,
    "status" TEXT,
    "notes" TEXT,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "NotionRef_pkey" PRIMARY KEY ("refId")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "vaId" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "summary" TEXT NOT NULL,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "service" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "durationMs" INTEGER,
    "message" TEXT NOT NULL,

    CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "worker" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "RunStatus" NOT NULL DEFAULT 'FAILED',
    "firstErrorLine" TEXT,
    "detailsJson" JSONB,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "ip" TEXT,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "details" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Va_email_key" ON "Va"("email");

-- CreateIndex
CREATE INDEX "DeskLogHours_vaId_idx" ON "DeskLogHours"("vaId");

-- CreateIndex
CREATE UNIQUE INDEX "DeskLogHours_date_vaId_key" ON "DeskLogHours"("date", "vaId");

-- CreateIndex
CREATE INDEX "DeskLogEfficiency_vaId_idx" ON "DeskLogEfficiency"("vaId");

-- CreateIndex
CREATE UNIQUE INDEX "DeskLogEfficiency_date_vaId_key" ON "DeskLogEfficiency"("date", "vaId");

-- CreateIndex
CREATE INDEX "CapacityFlagEvent_vaId_idx" ON "CapacityFlagEvent"("vaId");

-- CreateIndex
CREATE INDEX "PayrollCalculation_vaId_idx" ON "PayrollCalculation"("vaId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollCalculation_periodStart_vaId_key" ON "PayrollCalculation"("periodStart", "vaId");

-- CreateIndex
CREATE INDEX "TierReview_vaId_idx" ON "TierReview"("vaId");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_email_key" ON "Candidate"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_trainingAccessToken_key" ON "Candidate"("trainingAccessToken");

-- CreateIndex
CREATE INDEX "Candidate_currentStage_idx" ON "Candidate"("currentStage");

-- CreateIndex
CREATE INDEX "TrainingSession_candidateId_idx" ON "TrainingSession"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "Onboarding_vaId_key" ON "Onboarding"("vaId");

-- CreateIndex
CREATE INDEX "ActivityLog_timestamp_idx" ON "ActivityLog"("timestamp");

-- CreateIndex
CREATE INDEX "SystemLog_timestamp_idx" ON "SystemLog"("timestamp");

-- CreateIndex
CREATE INDEX "SyncRun_worker_idx" ON "SyncRun"("worker");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_vaId_fkey" FOREIGN KEY ("vaId") REFERENCES "Va"("vaId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Va" ADD CONSTRAINT "Va_supervisorVaId_fkey" FOREIGN KEY ("supervisorVaId") REFERENCES "Va"("vaId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeskLogHours" ADD CONSTRAINT "DeskLogHours_vaId_fkey" FOREIGN KEY ("vaId") REFERENCES "Va"("vaId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeskLogEfficiency" ADD CONSTRAINT "DeskLogEfficiency_vaId_fkey" FOREIGN KEY ("vaId") REFERENCES "Va"("vaId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapacityFlagEvent" ADD CONSTRAINT "CapacityFlagEvent_vaId_fkey" FOREIGN KEY ("vaId") REFERENCES "Va"("vaId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollCalculation" ADD CONSTRAINT "PayrollCalculation_periodStart_fkey" FOREIGN KEY ("periodStart") REFERENCES "PayrollPeriod"("periodStart") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollCalculation" ADD CONSTRAINT "PayrollCalculation_vaId_fkey" FOREIGN KEY ("vaId") REFERENCES "Va"("vaId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TierReview" ADD CONSTRAINT "TierReview_vaId_fkey" FOREIGN KEY ("vaId") REFERENCES "Va"("vaId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("candidateId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Onboarding" ADD CONSTRAINT "Onboarding_vaId_fkey" FOREIGN KEY ("vaId") REFERENCES "Va"("vaId") ON DELETE RESTRICT ON UPDATE CASCADE;

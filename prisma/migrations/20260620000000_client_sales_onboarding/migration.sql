-- AlterEnum
ALTER TYPE "ClientOrgStatus" ADD VALUE 'onboarding';

-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('new', 'discovery_scheduled', 'discovery_completed', 'proposal_needed', 'proposal_sent', 'negotiation', 'verbal_yes', 'won', 'lost', 'nurture', 'no_show');

-- CreateEnum
CREATE TYPE "ClientAgreementStatus" AS ENUM ('draft', 'sent', 'viewed', 'signed', 'paid', 'active', 'void');

-- CreateEnum
CREATE TYPE "ClientOnboardingStatus" AS ENUM ('pending', 'in_progress', 'completed');

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "notionPageId" TEXT,
    "orgName" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "source" TEXT,
    "accountOwnerEmail" TEXT,
    "stage" "DealStage" NOT NULL DEFAULT 'new',
    "packageName" TEXT,
    "dealValue" DOUBLE PRECISION,
    "billingType" TEXT,
    "startDate" TIMESTAMP(3),
    "reviewNeeded" BOOLEAN NOT NULL DEFAULT false,
    "reviewApproved" BOOLEAN NOT NULL DEFAULT false,
    "reviewNotes" TEXT,
    "handoffSummary" JSONB,
    "lostReason" TEXT,
    "nextFollowUpAt" TIMESTAMP(3),
    "lastContactAt" TIMESTAMP(3),
    "clientOrgId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientAgreement" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "signToken" TEXT,
    "status" "ClientAgreementStatus" NOT NULL DEFAULT 'draft',
    "packageName" TEXT,
    "priceLabel" TEXT,
    "billingType" TEXT,
    "deadline" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "signerName" TEXT,
    "signerEmail" TEXT,
    "signerIp" TEXT,
    "userAgent" TEXT,
    "signatureImage" TEXT,
    "termsHash" TEXT,
    "pdfDriveFileId" TEXT,
    "pdfWebViewLink" TEXT,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripeInvoiceId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientOnboarding" (
    "id" TEXT NOT NULL,
    "clientOrganizationId" TEXT NOT NULL,
    "owner" TEXT,
    "intakeToken" TEXT,
    "intakeJson" JSONB,
    "intakeReceivedAt" TIMESTAMP(3),
    "status" "ClientOnboardingStatus" NOT NULL DEFAULT 'pending',
    "intakeReceived" BOOLEAN NOT NULL DEFAULT false,
    "onboardingCallBooked" BOOLEAN NOT NULL DEFAULT false,
    "onboardingCallDone" BOOLEAN NOT NULL DEFAULT false,
    "driveFolderCreated" BOOLEAN NOT NULL DEFAULT false,
    "portalAccessGranted" BOOLEAN NOT NULL DEFAULT false,
    "commsCadenceSet" BOOLEAN NOT NULL DEFAULT false,
    "firstWeekPriorities" BOOLEAN NOT NULL DEFAULT false,
    "vaAssigned" BOOLEAN NOT NULL DEFAULT false,
    "kickoffRecapSent" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Deal_notionPageId_key" ON "Deal"("notionPageId");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_clientOrgId_key" ON "Deal"("clientOrgId");

-- CreateIndex
CREATE INDEX "Deal_stage_idx" ON "Deal"("stage");

-- CreateIndex
CREATE INDEX "Deal_nextFollowUpAt_idx" ON "Deal"("nextFollowUpAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClientAgreement_dealId_key" ON "ClientAgreement"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientAgreement_signToken_key" ON "ClientAgreement"("signToken");

-- CreateIndex
CREATE UNIQUE INDEX "ClientOnboarding_clientOrganizationId_key" ON "ClientOnboarding"("clientOrganizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientOnboarding_intakeToken_key" ON "ClientOnboarding"("intakeToken");

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_clientOrgId_fkey" FOREIGN KEY ("clientOrgId") REFERENCES "ClientOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAgreement" ADD CONSTRAINT "ClientAgreement_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientOnboarding" ADD CONSTRAINT "ClientOnboarding_clientOrganizationId_fkey" FOREIGN KEY ("clientOrganizationId") REFERENCES "ClientOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "PayrollRowStatus" AS ENUM ('submitted', 'approved', 'excluded', 'paid');

-- AlterTable
ALTER TABLE "PayrollCalculation" ADD COLUMN     "rowStatus" "PayrollRowStatus" NOT NULL DEFAULT 'submitted',
ADD COLUMN     "approvedByEmail" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "excludedReason" TEXT,
ADD COLUMN     "flagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "flagReasons" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "Va" ADD COLUMN     "trustedForBulkApprove" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "VaPaymentProfile" (
    "id" TEXT NOT NULL,
    "vaId" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'WISE',
    "payoutCurrency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaPaymentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientProjectMap" (
    "id" TEXT NOT NULL,
    "project" TEXT NOT NULL,
    "clientOrgId" TEXT,
    "createdByEmail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientProjectMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VaPaymentProfile_vaId_key" ON "VaPaymentProfile"("vaId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientProjectMap_project_key" ON "ClientProjectMap"("project");

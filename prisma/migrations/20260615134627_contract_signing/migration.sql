-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "contractSignToken" TEXT;

-- CreateTable
CREATE TABLE "ContractSignature" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerEmail" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signerIp" TEXT,
    "userAgent" TEXT,
    "signatureImage" TEXT,
    "templateHash" TEXT NOT NULL,
    "pdfDriveFileId" TEXT,
    "pdfWebViewLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractSignature_candidateId_key" ON "ContractSignature"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_contractSignToken_key" ON "Candidate"("contractSignToken");


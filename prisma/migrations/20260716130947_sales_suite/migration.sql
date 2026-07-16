-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "upgradeOfAccountId" TEXT,
ADD COLUMN     "wonAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SalesFollowUp" (
    "id" TEXT NOT NULL,
    "due" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'email',
    "refType" TEXT,
    "refId" TEXT,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesEmailTemplate" (
    "id" TEXT NOT NULL,
    "cat" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesEmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientAccount" (
    "id" TEXT NOT NULL,
    "org" TEXT NOT NULL,
    "contact" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "pkg" TEXT NOT NULL DEFAULT 'Custom',
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hoursUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastTouch" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerEmail" TEXT NOT NULL DEFAULT '',
    "health" TEXT NOT NULL DEFAULT 'new',
    "checkinDue" BOOLEAN NOT NULL DEFAULT false,
    "testimonial" TEXT NOT NULL DEFAULT 'none',
    "upgradeDealId" TEXT,
    "clientOrgId" TEXT,
    "timeline" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesFollowUp_doneAt_due_idx" ON "SalesFollowUp"("doneAt", "due");

-- CreateIndex
CREATE UNIQUE INDEX "ClientAccount_clientOrgId_key" ON "ClientAccount"("clientOrgId");


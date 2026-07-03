-- Client → team assignment: internal staff ↔ client (many-to-many, LEAD/MEMBER).

-- CreateEnum
CREATE TYPE "ClientTeamRole" AS ENUM ('LEAD', 'MEMBER');

-- CreateTable
CREATE TABLE "ClientAssignment" (
    "id" TEXT NOT NULL,
    "clientOrganizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ClientTeamRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientAssignment_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "ClientAssignment_clientOrganizationId_userId_key" ON "ClientAssignment"("clientOrganizationId", "userId");
CREATE INDEX "ClientAssignment_clientOrganizationId_idx" ON "ClientAssignment"("clientOrganizationId");
CREATE INDEX "ClientAssignment_userId_idx" ON "ClientAssignment"("userId");

-- ForeignKeys
ALTER TABLE "ClientAssignment" ADD CONSTRAINT "ClientAssignment_clientOrganizationId_fkey" FOREIGN KEY ("clientOrganizationId") REFERENCES "ClientOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientAssignment" ADD CONSTRAINT "ClientAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

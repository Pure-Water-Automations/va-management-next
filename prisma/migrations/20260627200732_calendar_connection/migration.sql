-- AlterTable: GCal event linkage on Deal
ALTER TABLE "Deal" ADD COLUMN     "discoveryCalEventId" TEXT,
ADD COLUMN     "discoveryCalId" TEXT;

-- CreateTable: per-rep Google Calendar credential
CREATE TABLE "CalendarConnection" (
    "id" TEXT NOT NULL,
    "repEmail" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessToken" TEXT,
    "tokenUri" TEXT,
    "expiryDate" BIGINT,
    "scope" TEXT,
    "email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarConnection_repEmail_key" ON "CalendarConnection"("repEmail");

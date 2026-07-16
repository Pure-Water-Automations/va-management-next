-- CreateTable
CREATE TABLE "CfoSnapshot" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "hasNarrative" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,

    CONSTRAINT "CfoSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CfoSnapshot_createdAt_idx" ON "CfoSnapshot"("createdAt");


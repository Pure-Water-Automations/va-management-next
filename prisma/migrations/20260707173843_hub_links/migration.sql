-- CreateTable
CREATE TABLE "Link" (
    "id" TEXT NOT NULL,
    "fromType" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toType" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Link_fromType_fromId_idx" ON "Link"("fromType", "fromId");

-- CreateIndex
CREATE INDEX "Link_toType_toId_idx" ON "Link"("toType", "toId");

-- CreateIndex
CREATE UNIQUE INDEX "Link_fromType_fromId_toType_toId_key" ON "Link"("fromType", "fromId", "toType", "toId");


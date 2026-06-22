-- Auto-enhance (tighten via Video Core) fields on Recording
ALTER TABLE "Recording" ADD COLUMN "enhanceStatus" TEXT;
ALTER TABLE "Recording" ADD COLUMN "enhancedKey" TEXT;
ALTER TABLE "Recording" ADD COLUMN "enhancedDurationSec" DOUBLE PRECISION;
ALTER TABLE "Recording" ADD COLUMN "enhanceStats" JSONB;
ALTER TABLE "Recording" ADD COLUMN "enhanceError" TEXT;
ALTER TABLE "Recording" ADD COLUMN "enhancedAt" TIMESTAMP(3);

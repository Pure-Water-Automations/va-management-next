-- WhatsApp notifications (beta): per-VA channel + number.

-- CreateEnum
CREATE TYPE "NotifyChannel" AS ENUM ('both', 'email', 'whatsapp', 'none');

-- AlterTable
ALTER TABLE "Va" ADD COLUMN "whatsappNumber" TEXT;
ALTER TABLE "Va" ADD COLUMN "notifyChannel" "NotifyChannel" NOT NULL DEFAULT 'both';

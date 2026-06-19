-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "claimRequestedById" TEXT,
ADD COLUMN     "claimable" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_claimRequestedById_fkey" FOREIGN KEY ("claimRequestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

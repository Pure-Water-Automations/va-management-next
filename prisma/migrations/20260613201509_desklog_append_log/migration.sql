-- DropIndex
DROP INDEX "DeskLogEfficiency_date_vaId_key";

-- DropIndex
DROP INDEX "DeskLogHours_date_vaId_key";

-- CreateIndex
CREATE INDEX "DeskLogEfficiency_date_vaId_idx" ON "DeskLogEfficiency"("date", "vaId");

-- CreateIndex
CREATE INDEX "DeskLogHours_date_vaId_idx" ON "DeskLogHours"("date", "vaId");

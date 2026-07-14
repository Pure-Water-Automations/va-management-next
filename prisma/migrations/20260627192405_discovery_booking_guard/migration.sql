-- Performance index for the open-slots / reminder queries.
CREATE INDEX "Deal_discoveryCallStatus_discoveryCallAt_idx" ON "Deal"("discoveryCallStatus", "discoveryCallAt");

-- Concurrency safety net: at most one SCHEDULED call per (rep, instant). The app
-- re-checks availability, but this stops a double-booking race at the DB.
CREATE UNIQUE INDEX "Deal_rep_call_scheduled_unique"
  ON "Deal"("discoveryRepEmail", "discoveryCallAt")
  WHERE "discoveryCallStatus" = 'scheduled';

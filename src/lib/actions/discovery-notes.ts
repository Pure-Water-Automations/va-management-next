/**
 * Discovery-call notes + call-outcome transitions (Phase 3). Saving notes implies
 * the call happened, so it completes the call and advances the pipeline; a no-show
 * is its own transition. Mirrors the recruitment saveInterview pattern.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { normalizeDiscoveryNotes } from "@/lib/discovery-notes";

/** Save the structured call notes and advance the deal out of the call stage. */
export async function saveDiscoveryNotes(dealId: string, raw: Record<string, unknown>) {
  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new Error("Deal not found.");
  const notes = normalizeDiscoveryNotes(raw);

  const data: Prisma.DealUpdateInput = {
    discoveryNotesJson: notes as Prisma.InputJsonValue,
    lastContactAt: new Date(),
  };
  if (notes.followUpDate) data.nextFollowUpAt = new Date(notes.followUpDate);
  if (notes.recommendedPackage && !deal.packageName) data.packageName = notes.recommendedPackage;
  // Saving notes means the call took place.
  if (deal.discoveryCallStatus === "scheduled") data.discoveryCallStatus = "completed";
  if (deal.stage === "discovery_scheduled") data.stage = "discovery_completed";

  const updated = await db.deal.update({ where: { id: dealId }, data });
  await logActivity({
    source: "sales",
    eventType: "discovery_notes_saved",
    summary: `${deal.orgName}: discovery notes saved${updated.stage !== deal.stage ? ` → ${updated.stage}` : ""}`,
  });
  return { ok: true, stage: updated.stage };
}

/** Mark the call outcome (completed / no_show / scheduled) without notes. */
export async function setCallStatus(dealId: string, status: string) {
  if (!["completed", "no_show", "scheduled"].includes(status)) throw new Error(`Invalid call status: ${status}`);
  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new Error("Deal not found.");

  const data: Prisma.DealUpdateInput = { discoveryCallStatus: status, lastContactAt: new Date() };
  if (status === "no_show") data.stage = "no_show";
  else if (status === "completed" && deal.stage === "discovery_scheduled") data.stage = "discovery_completed";

  const updated = await db.deal.update({ where: { id: dealId }, data });
  await logActivity({
    source: "sales",
    eventType: "discovery_call_status",
    severity: status === "no_show" ? "warning" : "info",
    summary: `${deal.orgName}: discovery call marked ${status}`,
  });
  return { ok: true, stage: updated.stage };
}

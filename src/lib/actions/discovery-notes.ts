/**
 * Discovery-call notes + call-outcome transitions (Phase 3). Saving notes implies
 * the call happened, so it completes the call and advances the pipeline; a no-show
 * is its own transition. Mirrors the recruitment saveInterview pattern.
 */
import type { DealStage, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { normalizeDiscoveryNotes, notesHaveContent } from "@/lib/discovery-notes";

/**
 * Stages where a discovery call can legitimately be (re)marked "scheduled". A
 * call belongs to the pre-proposal part of the funnel, so marking one scheduled
 * on a `proposal_sent`/`won`/… deal would resurrect a stale chip — reject it.
 */
const CALL_SCHEDULABLE_STAGES: readonly DealStage[] = [
  "new",
  "discovery_scheduled",
  "nurture",
  "no_show",
];

/** Whether a call may be marked "scheduled" while the deal is at this stage. */
export function canMarkCallScheduled(stage: DealStage): boolean {
  return CALL_SCHEDULABLE_STAGES.includes(stage);
}

/** Save the structured call notes and advance the deal out of the call stage. */
export async function saveDiscoveryNotes(dealId: string, raw: Record<string, unknown>) {
  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new Error("Deal not found.");
  const notes = normalizeDiscoveryNotes(raw);
  // Don't let an empty payload wipe existing notes or silently complete a call.
  if (!notesHaveContent(notes)) throw new Error("Please enter some call notes before saving.");

  const data: Prisma.DealUpdateInput = {
    discoveryNotesJson: notes as Prisma.InputJsonValue,
    // Keep the deal's follow-up date in sync with the notes (clear if removed).
    nextFollowUpAt: notes.followUpDate ? new Date(notes.followUpDate) : null,
    lastContactAt: new Date(),
  };
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
  // Don't let a "scheduled" chip be resurrected on a deal that's already past
  // the discovery phase (proposal_sent / negotiation / won / …).
  if (status === "scheduled" && !canMarkCallScheduled(deal.stage)) {
    throw new Error(`Cannot mark a call scheduled while the deal is at "${deal.stage}".`);
  }

  const data: Prisma.DealUpdateInput = { discoveryCallStatus: status, lastContactAt: new Date() };
  // Only step the pipeline stage from the call stage — never drag a later-stage
  // deal (proposal_sent / negotiation / won …) backwards on a stale request.
  if (deal.stage === "discovery_scheduled") {
    if (status === "no_show") data.stage = "no_show";
    else if (status === "completed") data.stage = "discovery_completed";
  }

  const updated = await db.deal.update({ where: { id: dealId }, data });
  await logActivity({
    source: "sales",
    eventType: "discovery_call_status",
    severity: status === "no_show" ? "warning" : "info",
    summary: `${deal.orgName}: discovery call marked ${status}`,
  });
  return { ok: true, stage: updated.stage };
}

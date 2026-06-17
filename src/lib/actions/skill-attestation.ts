/**
 * Native skill attestation — a VA in an open tier review confirms the skills
 * they're certifying. Replaces the legacy Google Form + onFormSubmit handler:
 * writes the skills onto the VA and advances the review to `under_review` so HR
 * can act on it. No Google round-trip.
 */
import type { TierReviewStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";

const OPEN_FOR_ATTESTATION: TierReviewStatus[] = ["hours_triggered", "form_sent"];

export async function submitSkillAttestation(
  vaId: string,
  skills: string[],
  actorVaId: string | null,
  actorEmail: string,
  opts: { isAdmin?: boolean } = {},
) {
  const targetVaId = (vaId ?? "").trim();
  if (!targetVaId) throw new Error("Missing field: vaId");
  if (!opts.isAdmin && actorVaId !== targetVaId) {
    throw new Error("This attestation isn't yours to submit.");
  }
  const cleaned = Array.from(new Set(skills.map((s) => s.trim()).filter(Boolean)));
  if (cleaned.length === 0) throw new Error("Please select at least one skill.");

  const va = await db.va.findUnique({ where: { vaId: targetVaId } });
  if (!va) throw new Error(`VA not found: ${targetVaId}`);

  const skillSpecs = cleaned.join(", ");

  const result = await db.$transaction(async (tx) => {
    const updatedVa = await tx.va.update({ where: { vaId: targetVaId }, data: { skillSpecs } });
    const open = await tx.tierReview.findFirst({
      where: { vaId: targetVaId, status: { in: OPEN_FOR_ATTESTATION } },
      orderBy: { timestamp: "desc" },
    });
    let review = null;
    if (open) {
      review = await tx.tierReview.update({ where: { id: open.id }, data: { status: "under_review" } });
    }
    return { va: updatedVa, review };
  });

  await logActivity({
    source: "va_action",
    eventType: "skill_attestation_submitted",
    vaId: targetVaId,
    severity: "info",
    summary: `${va.name} attested skills (${cleaned.length}) for tier review${result.review ? " — moved to under review" : ""} — ${actorEmail}`,
  });

  return { ok: true, skillSpecs, advanced: Boolean(result.review) };
}

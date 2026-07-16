/**
 * Native client-discovery intake — accepts a submission from the public /discover
 * funnel and creates (or refreshes) a Deal at stage "new", then kicks off
 * best-effort AI lead scoring. Mirrors actions/apply.ts (the recruitment side).
 */
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logActivity } from "@/lib/activity";
import { sendSystemEmail } from "@/lib/email";
import { loadSettings, num, str } from "@/lib/settings";
import { systemEmailFrom } from "@/lib/sales/util";
import { createDiscoverySubmissionGrant } from "@/lib/discovery-attachments";
import {
  validateDiscovery,
  dealFieldsFromAnswers,
  estimateAdminCost,
  fitVerdict,
} from "@/lib/discovery-questions";
import { scoreAndSaveLead } from "@/lib/actions/lead-screening";

/** Thrown for bad public input — the route surfaces its message; other errors stay internal. */
export class DiscoveryValidationError extends Error {}

// Native-form deals still in the intake funnel. A re-submission updates one of
// these; a contact whose only deal is won/lost/negotiating (or a non-native,
// manually-created deal) gets a fresh lead instead of overwriting real work.
const OPEN_INTAKE_STAGES = ["new", "discovery_scheduled", "discovery_completed", "nurture", "no_show"] as const;
// Stages that mean "we'd dropped them" — a fresh submission re-opens the lead.
const REENGAGE_STAGES = new Set(["nurture", "no_show"]);

function summaryWithAvailability(summary: string, availability: string): string {
  const base = summary.trim();
  const line = `Call availability: ${availability.trim()}`;
  return base ? `${base}\n\n${line}` : line;
}

export async function submitDiscoveryLead(raw: Record<string, unknown>) {
  const validation = validateDiscovery(raw);
  if (!validation.ok) throw new DiscoveryValidationError(validation.error);
  const answers = validation.answers;
  const fields = dealFieldsFromAnswers(answers);
  if (!fields.orgName) throw new DiscoveryValidationError("Please answer: your organization.");
  if (!fields.contactEmail) throw new DiscoveryValidationError("Please answer: your email address.");

  const settings = await loadSettings();
  const rate = num(settings, "admin_cost_rate", 25);
  const estimatedAdminCost = answers.hoursPerWeek ? estimateAdminCost(answers.hoursPerWeek, rate) : null;
  const availability = answers.availability || "";

  const data = {
    orgName: fields.orgName,
    contactName: fields.contactName,
    contactEmail: fields.contactEmail,
    source: "native_form",
    teamSize: fields.teamSize,
    missionStatement: fields.missionStatement,
    hoursPerWeek: fields.hoursPerWeek,
    budgetAvailable: fields.budgetAvailable,
    timeline: fields.timeline,
    painTags: (fields.painTags ?? undefined) as Prisma.InputJsonValue | undefined,
    triedBefore: fields.triedBefore,
    heardAbout: fields.heardAbout,
    estimatedAdminCost,
    fitVerdict: fitVerdict(answers),
    discoveryJson: answers as Prisma.InputJsonValue,
    // Give reps the scheduling context immediately. The best-effort AI pass below
    // replaces this with its summary, then appends the same explicit line.
    leadSummary: availability ? summaryWithAvailability("", availability) : null,
  };

  // Dedupe only against an existing native-form lead still in the intake funnel,
  // newest first. Won/lost/negotiating deals and manually-created (non-native)
  // deals are never overwritten — those get a fresh lead instead.
  const existing = await db.deal.findFirst({
    where: { contactEmail: fields.contactEmail, source: "native_form", stage: { in: [...OPEN_INTAKE_STAGES] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, stage: true, discoveryCallToken: true },
  });

  let isNew = false;
  let dealId: string;
  let bookingToken: string;
  if (existing) {
    // Refresh their answers; re-open the lead if we'd previously dropped it,
    // but never regress an in-progress deal (e.g. discovery_scheduled) back to new.
    const stageReset = REENGAGE_STAGES.has(existing.stage) ? { stage: "new" as const } : {};
    bookingToken = existing.discoveryCallToken ?? randomUUID();
    const updated = await db.deal.update({
      where: { id: existing.id },
      data: { ...data, ...stageReset, discoveryCallToken: bookingToken, lastContactAt: new Date() },
    });
    dealId = updated.id;
  } else {
    bookingToken = randomUUID();
    const created = await db.deal.create({ data: { ...data, stage: "new", discoveryCallToken: bookingToken, lastContactAt: new Date() } });
    dealId = created.id;
    isNew = true;
  }

  await logActivity({
    source: "sales_intake",
    eventType: isNew ? "lead_received" : "lead_updated",
    summary: `${isNew ? "New" : "Updated"} discovery lead: ${fields.orgName} (${fields.contactName ?? fields.contactEmail})`,
  });

  if (isNew) await notifySalesOwner(settings, fields, answers, estimatedAdminCost);

  // AI scoring — best-effort, never block the lead's submission.
  void scoreAndSaveLead(dealId)
    .then((result) => availability
      ? db.deal.update({
          where: { id: dealId },
          data: { leadSummary: summaryWithAvailability(result.summary, availability) },
        })
      : undefined)
    .catch(() => {});

  // bookingToken is the capability for the public slot picker + /discovery/[token].
  return {
    ok: true,
    dealId,
    isNew,
    bookingToken,
    attachmentGrant: createDiscoverySubmissionGrant(dealId, env.NEXTAUTH_SECRET),
  };
}

async function notifySalesOwner(
  settings: Map<string, string>,
  fields: ReturnType<typeof dealFieldsFromAnswers>,
  answers: Record<string, string>,
  estimatedAdminCost: number | null,
) {
  try {
    const from = systemEmailFrom(settings);
    const to = str(settings, "sales_owner_email") || str(settings, "hr_manager_email");
    if (!to) return;
    const base = (str(settings, "app_base_url") || env.APP_BASE_URL || "https://team.pwasecondbrain.uk").replace(/\/+$/, "");
    await sendSystemEmail({
      from,
      to,
      subject: `New discovery lead — ${fields.orgName}`,
      body:
        `A new client lead came in through the discovery funnel.\n\n` +
        `Organization: ${fields.orgName}\n` +
        `Contact: ${fields.contactName ?? "(not provided)"} <${fields.contactEmail}>\n` +
        `Phone: ${answers.phone || "—"}\n` +
        `Role: ${answers.role ?? "(not provided)"}\n` +
        `Team size: ${fields.teamSize ?? "—"}\n` +
        `Pain: ${(fields.painTags ?? []).join(", ") || "—"}\n` +
        `Hours/week on admin: ${fields.hoursPerWeek ?? "—"}\n` +
        `Funding available: ${fields.budgetAvailable ?? "—"}\n` +
        `Timeline: ${fields.timeline ?? "—"}\n` +
        `Call availability: ${answers.availability || "—"}\n` +
        (estimatedAdminCost ? `Est. admin cost: $${estimatedAdminCost.toLocaleString()}/yr\n` : "") +
        `\nReview the pipeline: ${base}/hr/sales`,
    });
  } catch {
    // best-effort — never fail the lead's submission on a mail hiccup
  }
}

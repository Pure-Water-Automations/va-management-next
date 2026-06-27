/**
 * Native client-discovery intake — accepts a submission from the public /discover
 * funnel and creates (or refreshes) a Deal at stage "new", then kicks off
 * best-effort AI lead scoring. Mirrors actions/apply.ts (the recruitment side).
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logActivity } from "@/lib/activity";
import { sendSystemEmail } from "@/lib/email";
import { loadSettings, num, str } from "@/lib/settings";
import {
  validateDiscovery,
  dealFieldsFromAnswers,
  estimateAdminCost,
  fitVerdict,
} from "@/lib/discovery-questions";
import { scoreAndSaveLead } from "@/lib/actions/lead-screening";

export async function submitDiscoveryLead(raw: Record<string, unknown>) {
  const validation = validateDiscovery(raw);
  if (!validation.ok) throw new Error(validation.error);
  const answers = validation.answers;
  const fields = dealFieldsFromAnswers(answers);
  if (!fields.orgName) throw new Error("Please answer: your organization.");
  if (!fields.contactEmail) throw new Error("Please answer: your email address.");

  const settings = await loadSettings();
  const rate = num(settings, "admin_cost_rate", 25);
  const estimatedAdminCost = answers.hoursPerWeek ? estimateAdminCost(answers.hoursPerWeek, rate) : null;

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
  };

  // Dedupe on contact email (Deal.contactEmail is not unique → findFirst).
  const existing = fields.contactEmail
    ? await db.deal.findFirst({ where: { contactEmail: fields.contactEmail }, select: { id: true } })
    : null;

  let isNew = false;
  let dealId: string;
  if (existing) {
    const updated = await db.deal.update({ where: { id: existing.id }, data: { ...data, lastContactAt: new Date() } });
    dealId = updated.id;
  } else {
    const created = await db.deal.create({ data: { ...data, stage: "new", lastContactAt: new Date() } });
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
  void scoreAndSaveLead(dealId).catch(() => {});

  return { ok: true, dealId, isNew };
}

async function notifySalesOwner(
  settings: Map<string, string>,
  fields: ReturnType<typeof dealFieldsFromAnswers>,
  answers: Record<string, string>,
  estimatedAdminCost: number | null,
) {
  try {
    const from = str(settings, "system_email_from");
    const to = str(settings, "sales_owner_email") || str(settings, "hr_manager_email");
    if (!from || !to) return;
    const base = (str(settings, "app_base_url") || env.APP_BASE_URL || "https://team.pwasecondbrain.uk").replace(/\/+$/, "");
    await sendSystemEmail({
      from,
      to,
      subject: `New discovery lead — ${fields.orgName}`,
      body:
        `A new client lead came in through the discovery funnel.\n\n` +
        `Organization: ${fields.orgName}\n` +
        `Contact: ${fields.contactName ?? "(not provided)"} <${fields.contactEmail}>\n` +
        `Role: ${answers.role ?? "(not provided)"}\n` +
        `Team size: ${fields.teamSize ?? "—"}\n` +
        `Pain: ${(fields.painTags ?? []).join(", ") || "—"}\n` +
        `Hours/week on admin: ${fields.hoursPerWeek ?? "—"}\n` +
        `Funding available: ${fields.budgetAvailable ?? "—"}\n` +
        `Timeline: ${fields.timeline ?? "—"}\n` +
        (estimatedAdminCost ? `Est. admin cost: $${estimatedAdminCost.toLocaleString()}/yr\n` : "") +
        `\nReview the pipeline: ${base}/hr/sales`,
    });
  } catch {
    // best-effort — never fail the lead's submission on a mail hiccup
  }
}

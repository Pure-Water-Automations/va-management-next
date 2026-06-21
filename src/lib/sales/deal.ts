import type { DealStage, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { loadSettings } from "@/lib/settings";
import { sendSystemEmail } from "@/lib/email";
import { slugify, systemEmailFrom, teamRecipients, companyName } from "@/lib/sales/util";

export const DEAL_STAGES: DealStage[] = [
  "new",
  "discovery_scheduled",
  "discovery_completed",
  "proposal_needed",
  "proposal_sent",
  "negotiation",
  "verbal_yes",
  "won",
  "lost",
  "nurture",
  "no_show",
];

export type DealInput = {
  orgName: string;
  contactName?: string | null;
  contactEmail?: string | null;
  source?: string | null;
  accountOwnerEmail?: string | null;
  stage?: DealStage;
  packageName?: string | null;
  dealValue?: number | null;
  billingType?: string | null;
  startDate?: Date | null;
  notionPageId?: string | null;
  nextFollowUpAt?: Date | null;
};

export async function createDeal(input: DealInput) {
  if (!input.orgName?.trim()) throw new Error("orgName is required.");
  const deal = await db.deal.create({
    data: {
      orgName: input.orgName.trim(),
      contactName: input.contactName ?? null,
      contactEmail: input.contactEmail ?? null,
      source: input.source ?? null,
      accountOwnerEmail: input.accountOwnerEmail ?? null,
      stage: input.stage ?? "new",
      packageName: input.packageName ?? null,
      dealValue: input.dealValue ?? null,
      billingType: input.billingType ?? null,
      startDate: input.startDate ?? null,
      notionPageId: input.notionPageId ?? null,
      nextFollowUpAt: input.nextFollowUpAt ?? null,
      lastContactAt: new Date(),
    },
  });
  await logActivity({ source: "sales", eventType: "deal_created", summary: `Deal created: ${deal.orgName} (${deal.stage})` });
  return deal;
}

export async function setDealStage(dealId: string, stage: DealStage, note?: string) {
  if (!DEAL_STAGES.includes(stage)) throw new Error(`Invalid deal stage: ${stage}`);
  const data: Prisma.DealUpdateInput = { stage, lastContactAt: new Date() };
  if (note?.trim()) data.reviewNotes = note.trim();
  if (stage === "lost" && note?.trim()) data.lostReason = note.trim();
  const deal = await db.deal.update({ where: { id: dealId }, data });
  await logActivity({ source: "sales", eventType: "deal_stage", summary: `${deal.orgName} → ${stage}${note ? `: ${note}` : ""}` });
  await syncDealToNotion(dealId).catch(() => {});
  return deal;
}

/**
 * The "Contract + Payment Complete → Create Client" automation, in-app.
 * Idempotent on Deal.clientOrgId. Creates the portal org + onboarding record and
 * moves the deal to `won`. Safe to call repeatedly (mirrors candidate provisioning).
 */
export async function convertDealToClient(dealId: string) {
  const deal = await db.deal.findUnique({ where: { id: dealId }, include: { agreement: true } });
  if (!deal) throw new Error("Deal not found.");
  if (deal.clientOrgId) {
    const existing = await db.clientOrganization.findUnique({ where: { id: deal.clientOrgId } });
    if (existing) return existing;
  }

  // Hard gate (SOP: "no work before signed + paid"). Enforced HERE so no caller
  // can bypass it — not the HR manual "convert" action, not the MCP
  // `convert_deal_to_client` tool. Offline deals use the manual mark-signed /
  // mark-paid fallbacks first, which then satisfy this gate. Keeps the
  // "signed & paid" notification email below truthful.
  if (!deal.agreement?.signedAt || !deal.agreement?.paidAt) {
    throw new Error("Cannot convert: the agreement must be signed and paid first.");
  }

  // Pick a unique slug.
  let slug = slugify(deal.orgName);
  for (let i = 2; await db.clientOrganization.findUnique({ where: { slug } }); i++) {
    slug = `${slugify(deal.orgName)}-${i}`;
  }

  const org = await db.clientOrganization.create({
    data: { name: deal.orgName, slug, status: "onboarding", active: true },
  });

  await db.clientOnboarding.create({
    data: {
      clientOrganizationId: org.id,
      owner: deal.accountOwnerEmail ?? null,
      status: "pending",
    },
  });

  await db.deal.update({ where: { id: dealId }, data: { clientOrgId: org.id, stage: "won" } });

  await logActivity({
    source: "sales",
    eventType: "deal_won_client_created",
    severity: "success",
    summary: `${deal.orgName} won → client org + onboarding created`,
  });

  // Notify the onboarding owner / team (best-effort).
  const settings = await loadSettings();
  const to = [deal.accountOwnerEmail, ...teamRecipients(settings)].filter(Boolean) as string[];
  if (to.length) {
    await sendSystemEmail({
      from: systemEmailFrom(settings),
      to,
      subject: `New client signed & paid: ${deal.orgName}`,
      body: [
        `${deal.orgName} is signed and paid — onboarding has started.`,
        "",
        `Package: ${deal.packageName ?? "—"}`,
        `Start date: ${deal.startDate ? deal.startDate.toISOString().slice(0, 10) : "—"}`,
        "",
        `Open onboarding: ${appBaseLink(settings)}/hr/client-onboarding`,
        "",
        `— ${companyName(settings)}`,
      ].join("\n"),
    }).catch((err) => console.warn("convertDealToClient: notify failed:", err instanceof Error ? err.message : err));
  }

  return org;
}

/**
 * Advance a deal once both gates are satisfied (signed + paid). Called after
 * signing and after payment confirmation. No-op unless both are true.
 */
export async function maybeConvertDeal(dealId: string) {
  const agreement = await db.clientAgreement.findUnique({ where: { dealId } });
  if (!agreement) return null;
  const signed = !!agreement.signedAt;
  const paid = !!agreement.paidAt;
  if (signed && paid) return convertDealToClient(dealId);
  return null;
}

function appBaseLink(settings: Map<string, string>): string {
  return (settings.get("app_base_url")?.trim() || "https://team.pwasecondbrain.uk").replace(/\/+$/, "");
}

/**
 * One-way mirror of app-owned stage changes back to the Notion Pipeline page.
 * Best-effort: only runs when a Notion bridge token is configured, otherwise a
 * graceful no-op (the SOP keeps Notion authoritative for the funnel).
 */
export async function syncDealToNotion(dealId: string): Promise<void> {
  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal?.notionPageId) return;
  // Notion write is performed by the Notion connector/worker; here we just record
  // that a sync is due so the mirror worker (or MCP) can pick it up. Recording the
  // intent keeps this module free of a hard Notion dependency.
  await logActivity({
    source: "sales",
    eventType: "deal_notion_sync_due",
    summary: `Notion sync due for ${deal.orgName} (${deal.stage}) → page ${deal.notionPageId}`,
  });
}

import type { DealStage, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { loadSettings } from "@/lib/settings";
import { sendSystemEmail } from "@/lib/email";
import { slugify, systemEmailFrom, teamRecipients, companyName } from "@/lib/sales/util";
import { pkgByName } from "@/lib/sales/packages";

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

/**
 * Stages that are strictly past the discovery call. A deal reaching one of these
 * with its call chip still "scheduled" is a stale artifact (e.g. a won deal
 * showing a 📅 chip) — reconcile it to "completed".
 */
const PAST_DISCOVERY_STAGES: readonly DealStage[] = [
  "proposal_needed",
  "proposal_sent",
  "negotiation",
  "verbal_yes",
  "won",
];

/**
 * Decide how a stage move should reconcile the independent `discoveryCallStatus`
 * chip (pure — unit-tested):
 *  - moving past discovery while the chip is still "scheduled" → "completed";
 *  - moving back to `new` with a "scheduled" chip whose call time has passed →
 *    "cleared" (drop the stale chip);
 *  - otherwise leave it alone (`null`).
 */
export function reconcileCallStatusForStage(opts: {
  stage: DealStage;
  callStatus: string | null;
  callAt: Date | null;
  now: Date;
}): "completed" | "cleared" | null {
  if (opts.callStatus !== "scheduled") return null;
  if (PAST_DISCOVERY_STAGES.includes(opts.stage)) return "completed";
  if (opts.stage === "new" && opts.callAt && opts.callAt.getTime() < opts.now.getTime()) return "cleared";
  return null;
}

export async function setDealStage(dealId: string, stage: DealStage, note?: string) {
  if (!DEAL_STAGES.includes(stage)) throw new Error(`Invalid deal stage: ${stage}`);
  const now = new Date();
  const data: Prisma.DealUpdateInput = { stage, lastContactAt: now };
  if (note?.trim()) data.reviewNotes = note.trim();
  if (stage === "lost" && note?.trim()) data.lostReason = note.trim();
  // Stamp the win once, so "won this month" reporting can be computed later.
  if (stage === "won") data.wonAt = now;
  // Reconcile the discovery-call chip so it can't drift from the stage.
  const current = await db.deal.findUnique({
    where: { id: dealId },
    select: { discoveryCallStatus: true, discoveryCallAt: true },
  });
  if (current) {
    const reconciled = reconcileCallStatusForStage({
      stage,
      callStatus: current.discoveryCallStatus,
      callAt: current.discoveryCallAt,
      now,
    });
    if (reconciled === "completed") data.discoveryCallStatus = "completed";
    else if (reconciled === "cleared") data.discoveryCallStatus = null;
  }
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
  // Same stale-call-chip reconciliation setDealStage does — this path also moves
  // a deal to "won" and must not leave a lingering "scheduled" chip on the card.
  const callFix =
    reconcileCallStatusForStage({ stage: "won", callStatus: deal.discoveryCallStatus, callAt: deal.discoveryCallAt, now: new Date() }) === "completed"
      ? { discoveryCallStatus: "completed" }
      : {};
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

  // UPGRADE deals grow an EXISTING client to the next package tier — never
  // create a second org/account for them. Bump the linked account instead and
  // hand back its org (if the account has one).
  if (deal.upgradeOfAccountId) {
    const account = await db.clientAccount.findUnique({ where: { id: deal.upgradeOfAccountId } });
    if (account) {
      const dateLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const timeline = Array.isArray(account.timeline) ? account.timeline : [];
      await db.clientAccount.update({
        where: { id: account.id },
        data: {
          pkg: deal.packageName ?? account.pkg,
          price: deal.dealValue ?? pkgByName(deal.packageName)?.price ?? account.price,
          upgradeDealId: null,
          lastTouch: new Date(),
          timeline: [
            { date: dateLabel, type: "note", note: `Upgraded to ${deal.packageName ?? "a new package"} — signed and paid.` },
            ...(timeline as Prisma.JsonArray),
          ] as Prisma.InputJsonValue,
        },
      });
      await db.deal.update({ where: { id: dealId }, data: { stage: "won", wonAt: new Date(), ...callFix } });
      // Mirror the win to Notion like the manual dropdown path does (best-effort).
      await syncDealToNotion(dealId).catch(() => {});
      await logActivity({
        source: "sales",
        eventType: "deal_won_client_created",
        severity: "success",
        summary: `${deal.orgName} upgrade won → ${account.org} moved to ${deal.packageName ?? "new package"}`,
      });
      return account.clientOrgId
        ? await db.clientOrganization.findUnique({ where: { id: account.clientOrgId } })
        : null;
    }
    // Dangling account reference — fall through to the normal conversion.
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

  await db.deal.update({ where: { id: dealId }, data: { clientOrgId: org.id, stage: "won", wonAt: new Date(), ...callFix } });
  // Mirror the win to Notion like the manual dropdown path does (best-effort).
  await syncDealToNotion(dealId).catch(() => {});

  // Sales console handoff (best-effort): the win lands as a client account on
  // the Client Accounts screen, flagged "to request" for a testimonial.
  try {
    const pkg = pkgByName(deal.packageName);
    const dateLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
    await db.clientAccount.upsert({
      where: { clientOrgId: org.id },
      update: {},
      create: {
        org: deal.orgName,
        contact: deal.contactName ?? "",
        email: deal.contactEmail ?? "",
        pkg: deal.packageName ?? "Custom",
        price: deal.dealValue ?? pkg?.price ?? 0,
        ownerEmail: deal.accountOwnerEmail ?? "",
        health: "new",
        testimonial: "torequest",
        clientOrgId: org.id,
        timeline: [{ date: dateLabel, type: "note", note: "Converted from pipeline — onboarding checklist started." }],
      },
    });
  } catch (e) {
    console.error("convertDealToClient: client-account handoff failed (non-fatal)", e);
  }

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
        `${deal.orgName} is signed and paid — onboarding has started. Let's give them a great first week.`,
        "",
        `Package: ${deal.packageName ?? "—"}`,
        `Start date: ${deal.startDate ? deal.startDate.toISOString().slice(0, 10) : "—"}`,
        "",
        `Open onboarding: ${appBaseLink(settings)}/hr/client-onboarding`,
        "",
        `— The ${companyName(settings)} team`,
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
  return (settings.get("app_base_url")?.trim() || "https://dev-team.pwasecondbrain.uk").replace(/\/+$/, "");
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

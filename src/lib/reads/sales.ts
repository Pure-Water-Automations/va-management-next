import { db } from "@/lib/db";
import type { DealRow } from "@/components/SalesBoard";

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** Load every deal as a board row (shared by the /sales console and /hr/sales). */
export async function loadSalesRows(): Promise<DealRow[]> {
  const deals = await db.deal.findMany({
    orderBy: [{ updatedAt: "desc" }],
    include: { agreement: { select: { status: true, signedAt: true, paidAt: true, sentAt: true } } },
  });
  return deals.map((d) => ({
    id: d.id,
    orgName: d.orgName,
    contactName: d.contactName,
    contactEmail: d.contactEmail,
    stage: d.stage,
    packageName: d.packageName,
    dealValue: d.dealValue,
    billingType: d.billingType,
    startDate: d.startDate ? d.startDate.toISOString().slice(0, 10) : null,
    clientOrgId: d.clientOrgId,
    accountOwnerEmail: d.accountOwnerEmail,
    source: d.source,
    leadVerdict: d.leadVerdict,
    leadScore: d.leadScore,
    leadSummary: d.leadSummary,
    attachmentKeys: stringArray(d.attachmentKeys),
    discoveryCallAt: d.discoveryCallAt ? d.discoveryCallAt.toISOString() : null,
    discoveryCallStatus: d.discoveryCallStatus,
    discoveryNotesJson: (d.discoveryNotesJson as DealRow["discoveryNotesJson"]) ?? null,
    agreement: d.agreement
      ? { status: d.agreement.status, sent: !!d.agreement.sentAt, signed: !!d.agreement.signedAt, paid: !!d.agreement.paidAt }
      : null,
  }));
}

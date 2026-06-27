import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { SalesBoard, type DealRow } from "@/components/SalesBoard";

export const dynamic = "force-dynamic";

export default async function HrSalesPage() {
  const user = await getCurrentUser();
  if (user.role !== "HR_MANAGER" && user.role !== "PEOPLE_OPS" && !user.isAdmin) redirect("/hr");

  const deals = await db.deal.findMany({
    orderBy: [{ updatedAt: "desc" }],
    include: { agreement: { select: { status: true, signedAt: true, paidAt: true, sentAt: true } } },
  });

  const rows: DealRow[] = deals.map((d) => ({
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
    source: d.source,
    leadVerdict: d.leadVerdict,
    leadScore: d.leadScore,
    leadSummary: d.leadSummary,
    discoveryCallAt: d.discoveryCallAt ? d.discoveryCallAt.toISOString() : null,
    discoveryCallStatus: d.discoveryCallStatus,
    agreement: d.agreement
      ? {
          status: d.agreement.status,
          sent: !!d.agreement.sentAt,
          signed: !!d.agreement.signedAt,
          paid: !!d.agreement.paidAt,
        }
      : null,
  }));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Clients</div>
          <h1>Sales pipeline</h1>
          <p className="small">
            Bottom-of-funnel closing seam. Top-of-funnel lead capture and qualification stay in the Notion Pipeline; bring a deal
            here at <strong>Verbal Yes</strong> to send the agreement, take payment, and onboard.
          </p>
        </div>
      </div>
      <SalesBoard deals={rows} />
    </>
  );
}

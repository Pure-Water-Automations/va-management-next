import { requireSalesUser } from "@/lib/auth/sales-guard";
import { loadCampaignRows } from "@/lib/reads/marketing";
import { CampaignsClient } from "@/components/marketing/CampaignsClient";

export const dynamic = "force-dynamic";

// Campaigns — every campaign tags its leads (Deal.source === campaign.tag),
// so the metrics on each card are live queries over the shared deals table.
export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ campaign?: string }> }) {
  await requireSalesUser();
  const sp = await searchParams;
  const campaigns = await loadCampaignRows();
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Marketing</div>
          <h1>Campaigns</h1>
          <p className="small">
            Every campaign tags its leads, so you can see exactly which effort produced which deals — and what they are worth.
          </p>
        </div>
      </div>
      <CampaignsClient campaigns={campaigns} initialOpenId={sp.campaign ?? null} />
    </>
  );
}

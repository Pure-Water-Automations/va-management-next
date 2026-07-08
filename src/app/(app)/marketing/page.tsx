import { requireSalesUser } from "@/lib/auth/sales-guard";
import { loadMarketingDashboard } from "@/lib/reads/marketing";
import { MarketingDashboard } from "@/components/marketing/MarketingDashboard";

export const dynamic = "force-dynamic";

// Marketing dashboard — where leads come from and what's due this week.
// Every lead number is a live query over the same deals table sales uses.
export default async function MarketingDashboardPage() {
  await requireSalesUser();
  const data = await loadMarketingDashboard();
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Marketing</div>
          <h1>Marketing dashboard</h1>
          <p className="small">
            Where leads come from and what is due this week. Lead numbers are the same ones sales sees — one shared truth.
          </p>
        </div>
      </div>
      <MarketingDashboard data={data} />
    </>
  );
}

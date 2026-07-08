import { requireSalesUser } from "@/lib/auth/sales-guard";
import { loadReferralsData } from "@/lib/reads/marketing";
import { ReferralsClient } from "@/components/marketing/ReferralsClient";

export const dynamic = "force-dynamic";

// Referral program — log every introduction; it becomes a lead card in the
// sales pipeline (source "referral").
export default async function ReferralsPage() {
  await requireSalesUser();
  const data = await loadReferralsData();
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Marketing</div>
          <h1>Referral program</h1>
          <p className="small">
            Happy clients open doors. Log every introduction — it becomes a lead card in the sales pipeline — and never
            let a thank-you slip.
          </p>
        </div>
      </div>
      <ReferralsClient referrers={data.referrers} openReferralPipeline={data.openReferralPipeline} />
    </>
  );
}

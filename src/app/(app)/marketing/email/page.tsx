import { requireSalesUser } from "@/lib/auth/sales-guard";
import { loadSequenceRows } from "@/lib/reads/marketing";
import { EmailPlannerClient } from "@/components/marketing/EmailPlannerClient";

export const dynamic = "force-dynamic";

// Email planner — sequences whose audiences sync live from the pipeline.
export default async function EmailPlannerPage() {
  const user = await requireSalesUser();
  const sequences = await loadSequenceRows();
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Marketing</div>
          <h1>Email planner</h1>
          <p className="small">
            Sequences run themselves — audiences sync from the sales pipeline. When a rep marks a lead Nurture, it joins
            the drip automatically; when a deal is won, the welcome series starts.
          </p>
        </div>
      </div>
      <EmailPlannerClient sequences={sequences} userEmail={user.email} />
    </>
  );
}

import { requireSalesUser } from "@/lib/auth/sales-guard";
import { loadFollowUps } from "@/lib/reads/sales-console";
import { FollowUpsClient } from "@/components/sales/FollowUpsClient";

export const dynamic = "force-dynamic";

// Sales — Follow-ups: the one list for everything owed to a lead or client.
export default async function SalesFollowUpsPage() {
  await requireSalesUser();
  const followUps = await loadFollowUps();
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Sales</div>
          <h1>Follow-ups</h1>
          <p className="small">
            One list for everything owed to a lead or client — call-note follow-ups, payment reminders,
            and check-ins land here automatically.
          </p>
        </div>
      </div>
      <FollowUpsClient followUps={followUps} />
    </>
  );
}

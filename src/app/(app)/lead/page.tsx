import { redirect } from "next/navigation";
import { requireSalesUser } from "@/lib/auth/sales-guard";
import { loadLeadOverview } from "@/lib/reads/lead";
import { BigPicture } from "@/components/lead/BigPicture";

export const dynamic = "force-dynamic";

// Team Lead — The Big Picture. Leadership screens are admin-only.
export default async function LeadOverviewPage() {
  const user = await requireSalesUser();
  if (!user.isAdmin) redirect("/sales");

  const data = await loadLeadOverview();
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Team Lead</div>
          <h1>The big picture</h1>
          <p className="small" style={{ maxWidth: 740 }}>
            Sales and marketing on one page — how the funnel looks right now, where you stand against targets,
            and what needs a nudge.
          </p>
        </div>
      </div>
      <BigPicture data={data} />
    </>
  );
}

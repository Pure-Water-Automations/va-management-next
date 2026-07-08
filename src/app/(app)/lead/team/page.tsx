import { redirect } from "next/navigation";
import { requireSalesUser } from "@/lib/auth/sales-guard";
import { loadTeam } from "@/lib/reads/lead";
import { TeamClient } from "@/components/lead/TeamClient";

export const dynamic = "force-dynamic";

// Team Lead — Team. Numbers pull live from deals, follow-ups, and content.
export default async function LeadTeamPage() {
  const user = await requireSalesUser();
  if (!user.isAdmin) redirect("/sales");

  const members = await loadTeam();
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Team Lead</div>
          <h1>Team</h1>
          <p className="small" style={{ maxWidth: 740 }}>
            Who is carrying what right now — numbers pull live from the pipeline, follow-ups, and the content
            calendar.
          </p>
        </div>
      </div>
      <TeamClient members={members} />
    </>
  );
}

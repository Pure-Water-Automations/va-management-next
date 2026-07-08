import { redirect } from "next/navigation";
import { requireSalesUser } from "@/lib/auth/sales-guard";
import { loadTargets } from "@/lib/reads/lead";
import { monthInfo } from "@/lib/sales/pace";
import { TargetsClient } from "@/components/lead/TargetsClient";

export const dynamic = "force-dynamic";

// Team Lead — Targets. Actuals compute live; only the target numbers save.
export default async function LeadTargetsPage() {
  const user = await requireSalesUser();
  if (!user.isAdmin) redirect("/sales");

  const targets = await loadTargets();
  const { label } = monthInfo();
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Team Lead</div>
          <h1>Targets</h1>
          <p className="small" style={{ maxWidth: 740 }}>
            Actuals update live from the pipeline, client accounts, and content. Change a target number and the
            bars follow — no separate save step.
          </p>
        </div>
        <div
          style={{
            background: "var(--color-navy-50, #eef0fa)",
            color: "var(--color-navy-800, #1a278a)",
            borderRadius: 9999,
            padding: "7px 14px",
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
      </div>
      <TargetsClient targets={targets} />
    </>
  );
}

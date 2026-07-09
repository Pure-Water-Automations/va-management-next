import { getCurrentUser } from "@/lib/auth/access";
import { getPayrollDashboard } from "@/lib/reads/payroll";
import { PayrollDashboardClient } from "@/components/payroll/PayrollDashboardClient";

export const dynamic = "force-dynamic";

export default async function PayrollPage() {
  const [user, d] = await Promise.all([getCurrentUser(), getPayrollDashboard()]);
  const canEditProfiles = user.isAdmin || user.role === "BOOKKEEPER" || user.role === "HR_MANAGER";
  const canExcludeRows = user.isAdmin || user.role === "HR_MANAGER" || user.role === "PEOPLE_OPS";

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Payroll</div>
          <h1>Payroll dashboard</h1>
          <p className="small" style={{ margin: "6px 0 0", maxWidth: 820, color: "var(--color-text-secondary)" }}>
            Semi-monthly runs (the 15th and two days before month end). Hours flow in from the tracker,
            supervisors approve, the bookkeeper pays. Rows must be Approved before the period can lock.
          </p>
        </div>
      </div>

      <PayrollDashboardClient
        period={
          d.openPeriod
            ? {
                start: d.openPeriod.periodStart.toISOString(),
                end: d.openPeriod.periodEnd.toISOString(),
                closeDate: d.openPeriod.closeDate.toISOString(),
                status: d.openPeriod.status,
              }
            : null
        }
        rows={JSON.parse(JSON.stringify(d.rows))}
        tiles={{
          nextRun: d.nextRun.toISOString(),
          totalGross: d.totalGross,
          beingPaid: d.beingPaid,
          activeVaCount: d.activeVaCount,
          statusCounts: d.statusCounts,
        }}
        pastPeriods={JSON.parse(JSON.stringify(d.pastPeriods))}
        rateChanges={JSON.parse(JSON.stringify(d.rateChanges))}
        canEditProfiles={canEditProfiles}
        canExcludeRows={canExcludeRows}
      />
    </>
  );
}

import { db } from "@/lib/db";
import { pluralize, titleCase } from "@/lib/labels";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

const money = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const periodKey = (d: Date) => d.toISOString().slice(0, 10);
const th: React.CSSProperties = {
  textAlign: "left", padding: "10px 16px", fontSize: "var(--text-xs)", textTransform: "uppercase",
  letterSpacing: "0.1em", color: "var(--color-text-tertiary)", borderBottom: "1px solid var(--color-border)", whiteSpace: "nowrap",
};
const td: React.CSSProperties = { padding: "11px 16px", borderBottom: "1px solid var(--color-border-subtle)", whiteSpace: "nowrap" };

export default async function PayrollArchive() {
  const [periods, rowStatusCounts] = await Promise.all([
    db.payrollPeriod.findMany({
      where: { status: { in: ["closed", "paid"] } },
      orderBy: { periodStart: "desc" },
    }),
    db.payrollCalculation.groupBy({ by: ["periodStart", "rowStatus"], _count: true }),
  ]);
  const countsByPeriod = new Map<string, { approved: number; excluded: number }>();
  for (const row of rowStatusCounts) {
    const counts = countsByPeriod.get(periodKey(row.periodStart)) ?? { approved: 0, excluded: 0 };
    if (row.rowStatus === "approved") counts.approved = row._count;
    if (row.rowStatus === "excluded") counts.excluded = row._count;
    countsByPeriod.set(periodKey(row.periodStart), counts);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Payroll</div>
          <h1>Period archive</h1>
        </div>
        <span className="small">{periods.length} closed/paid {pluralize(periods.length, "period")}</span>
      </div>

      <Card padding={0} style={{ overflow: "hidden" }} tourEl="/payroll/archive">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
            <thead>
              <tr>{["Period", "Close date", "Hours", "Gross", "Status"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {periods.map((p) => {
                const counts = countsByPeriod.get(periodKey(p.periodStart)) ?? { approved: 0, excluded: 0 };
                return (
                  <tr key={p.periodStart.toISOString()}>
                    <td style={td}>{day(p.periodStart)} – {day(p.periodEnd)}</td>
                    <td style={td}>{day(p.closeDate)}</td>
                    <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{(p.periodTotalHours ?? 0).toFixed(1)}</td>
                    <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{money(p.periodTotalPayroll)}</td>
                    <td style={td}>
                      <Badge variant={p.status === "paid" ? "success" : "default"}>{titleCase(p.status)}</Badge>
                      <div className="small" style={{ marginTop: 4, color: "var(--color-text-tertiary)" }}>
                        {counts.approved} approved · {counts.excluded} excluded
                      </div>
                    </td>
                  </tr>
                );
              })}
              {periods.length === 0 && (
                <tr><td style={{ ...td, fontStyle: "italic", color: "var(--color-text-tertiary)" }} colSpan={5}>No archived periods.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

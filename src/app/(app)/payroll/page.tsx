import { getPayrollDashboard } from "@/lib/reads/payroll";
import { titleCase } from "@/lib/labels";
import { Stat } from "@/components/ui/Stat";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ActionButton } from "@/components/ActionButton";

export const dynamic = "force-dynamic";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default async function PayrollConsole() {
  const d = await getPayrollDashboard();

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Payroll</div>
          <h1>Payroll console</h1>
        </div>
        {d.openPeriod && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Badge variant={d.openPeriod.status === "open" ? "info" : "default"}>
              {titleCase(d.openPeriod.status)}
            </Badge>
            <a
              href={`/api/payroll/export?period=${d.openPeriod.periodStart.toISOString().slice(0, 10)}`}
              style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-sky-600)", textDecoration: "none", border: "1px solid var(--color-border)", borderRadius: "var(--radius-input)", padding: "7px 12px" }}
            >
              ↓ Export CSV
            </a>
            {d.openPeriod.status === "open" && (
              <>
                <ActionButton path="/api/payroll/recalculate" body={{}} variant="ghost">
                  Recalculate
                </ActionButton>
                <ActionButton
                  path="/api/payroll/lock"
                  body={{}}
                  confirm="Lock this period? It will be marked closed and the bookkeeper emailed."
                  variant="primary"
                >
                  Lock & close
                </ActionButton>
              </>
            )}
            {d.openPeriod.status === "closed" && (
              <ActionButton
                path="/api/payroll/mark-paid"
                body={{ periodStart: d.openPeriod.periodStart.toISOString().slice(0, 10) }}
                confirm="Mark this period as paid?"
                variant="secondary"
              >
                Mark paid
              </ActionButton>
            )}
          </div>
        )}
      </div>

      {!d.openPeriod ? (
        <Card>
          <div className="small">No payroll periods found.</div>
        </Card>
      ) : (
        <>
          <div className="stat-grid" data-tour-el="/payroll">
            <Stat
              label="Current period"
              value={day(d.openPeriod.periodStart)}
              unit={`– ${day(d.openPeriod.periodEnd)}`}
            />
            <Stat label="Close date" value={day(d.openPeriod.closeDate)} />
            <Stat label="Total hours" value={d.totalHours.toFixed(1)} unit="h" />
            <Stat label="Gross payroll" value={money(d.totalGross)} variant="navy" />
          </div>

          <Card padding={0} style={{ overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-secondary)" }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", margin: 0 }}>
                Calculations
              </h2>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
                <thead>
                  <tr>
                    {["VA", "Role", "Type", "Hours", "Rate", "Gross"].map((h) => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.calcRows.map((r) => (
                    <tr key={r.id}>
                      <td style={td}>{r.name}</td>
                      <td style={td}>{r.compensationRole}</td>
                      <td style={td}>{r.compensationType}</td>
                      <td style={tdNum}>{r.hoursInPeriod.toFixed(1)}</td>
                      <td style={tdNum}>
                        {r.compensationType === "salary"
                          ? money(r.salaryPerPeriod ?? 0)
                          : `${money(r.hourlyRate ?? 0)}/h`}
                      </td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{money(r.grossPay)}</td>
                    </tr>
                  ))}
                  {d.calcRows.length === 0 && (
                    <tr>
                      <td style={{ ...td, fontStyle: "italic", color: "var(--color-text-tertiary)" }} colSpan={6}>
                        No calculations for this period yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card padding={0} style={{ overflow: "hidden", marginTop: 24 }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-secondary)" }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", margin: 0 }}>
                Rate-change history
              </h2>
            </div>
            {d.rateChanges.length === 0 ? (
              <div style={{ padding: 20, fontStyle: "italic", color: "var(--color-text-tertiary)" }}>
                No approved rate changes yet.
              </div>
            ) : (
              d.rateChanges.map((rc) => (
                <div key={rc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: "1px solid var(--color-border-subtle)" }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{rc.vaName ?? rc.vaId}</span>{" "}
                    <span className="small">{rc.currentRole ?? "—"} → {rc.targetRole ?? "—"}</span>
                  </div>
                  <span className="small" style={{ color: "var(--color-text-tertiary)" }}>
                    {rc.hrDecisionDate ? rc.hrDecisionDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}
                  </span>
                </div>
              ))
            )}
          </Card>
        </>
      )}
    </>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 16px",
  fontSize: "var(--text-xs)",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "var(--color-text-tertiary)",
  borderBottom: "1px solid var(--color-border)",
  whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "11px 16px",
  borderBottom: "1px solid var(--color-border-subtle)",
  whiteSpace: "nowrap",
};
const tdNum: React.CSSProperties = { ...td, textAlign: "right", fontFamily: "var(--font-mono)" };

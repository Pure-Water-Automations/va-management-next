import { getRegistry } from "@/lib/reads/hr-manage";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

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

function statusVariant(s: string) {
  return s === "active" ? "success" : s === "training" ? "info" : "default";
}

export default async function RegistryPage() {
  const rows = await getRegistry();
  const active = rows.filter((r) => r.va.status !== "departed").length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">HR · Manage</div>
          <h1>VA registry</h1>
        </div>
        <span className="small">{active} active · {rows.length} total</span>
      </div>

      <Card padding={0} style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
            <thead>
              <tr>
                {["VA", "Role", "Status", "Target/wk", "Cumulative", "Last check-in", "Eligible"].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ va, cumulative, eligibility, checkinAge }) => (
                <tr key={va.vaId}>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{va.name}</div>
                    <div className="small">{va.email}</div>
                  </td>
                  <td style={td}><Badge variant="primary">{va.compensationRole}</Badge></td>
                  <td style={td}><Badge variant={statusVariant(va.status)} dot>{va.status}</Badge></td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{va.targetHoursWeekly ?? "—"}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{Math.round(cumulative)}h</td>
                  <td style={td}>
                    {checkinAge == null ? (
                      <span className="small">never</span>
                    ) : (
                      <span className="small" style={{ color: checkinAge > 30 ? "var(--color-error)" : undefined }}>
                        {checkinAge}d ago
                      </span>
                    )}
                  </td>
                  <td style={td}>{eligibility.eligible ? <Badge variant="success" dot>Yes</Badge> : <span className="small">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

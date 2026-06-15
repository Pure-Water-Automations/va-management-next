import { getCheckins } from "@/lib/reads/hr-extra";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

const th: React.CSSProperties = {
  textAlign: "left", padding: "10px 16px", fontSize: "var(--text-xs)", textTransform: "uppercase",
  letterSpacing: "0.1em", color: "var(--color-text-tertiary)", borderBottom: "1px solid var(--color-border)", whiteSpace: "nowrap",
};
const td: React.CSSProperties = { padding: "11px 16px", borderBottom: "1px solid var(--color-border-subtle)", whiteSpace: "nowrap" };

export default async function CheckinsPage() {
  const rows = await getCheckins();
  const done = rows.filter((r) => r.thisMonth).length;
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">HR · Manage</div>
          <h1>Forms &amp; check-ins</h1>
        </div>
        <span className="small">{done} / {rows.length} checked in this month</span>
      </div>

      <Card padding={0} style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
            <thead>
              <tr>{["VA", "Last check-in", "This month"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(({ va, ageDays, thisMonth }) => (
                <tr key={va.vaId}>
                  <td style={td}><div style={{ fontWeight: 600 }}>{va.name}</div><div className="small">{va.email}</div></td>
                  <td style={td}>
                    {ageDays == null ? <span className="small">never</span> : (
                      <span className="small" style={{ color: ageDays > 30 ? "var(--color-error)" : undefined }}>{ageDays}d ago</span>
                    )}
                  </td>
                  <td style={td}>{thisMonth ? <Badge variant="success" dot>Done</Badge> : <Badge variant="warning" dot>Pending</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

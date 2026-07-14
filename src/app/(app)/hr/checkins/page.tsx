import { getCheckins } from "@/lib/reads/hr-extra";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const th: React.CSSProperties = {
  textAlign: "left", padding: "10px 16px", fontSize: "var(--text-xs)", textTransform: "uppercase",
  letterSpacing: "0.1em", color: "var(--color-text-tertiary)", borderBottom: "1px solid var(--color-border)", whiteSpace: "nowrap",
};
const td: React.CSSProperties = { padding: "11px 16px", borderBottom: "1px solid var(--color-border-subtle)", whiteSpace: "nowrap" };
const truncate: React.CSSProperties = { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", color: "var(--color-text-secondary)" };

export default async function CheckinsPage() {
  const rows = await getCheckins();
  const done = rows.filter((r) => r.thisMonth).length;
  const applyUrl = `${(env.APP_BASE_URL ?? "https://dev-team.pwasecondbrain.uk").replace(/\/+$/, "")}/apply`;
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">HR · Manage</div>
          <h1>Forms &amp; check-ins</h1>
        </div>
        <span className="small">{done} / {rows.length} checked in this month</span>
      </div>

      <Card style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>VA application form</div>
        <p className="small" style={{ marginTop: 0, marginBottom: 12 }}>
          The public form prospective VAs fill in. Share this link — submissions appear in{" "}
          <strong>Recruitment → Pipeline</strong> as <strong>Applied</strong> (each gets an automatic AI first-pass screen).
        </p>
        <a
          href={applyUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-block",
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid var(--color-border)",
            background: "var(--color-bg-secondary)",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "var(--text-sm)",
            color: "var(--color-sky-600, #0369a1)",
          }}
        >
          {applyUrl} ↗
        </a>
      </Card>

      <Card padding={0} style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
            <thead>
              <tr>{["VA", "Last check-in", "This month", "Days off", "Availability", "Notes"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(({ va, ageDays, thisMonth }) => {
                const days = (va.daysOff ?? "").split(",").map((d) => d.trim()).filter(Boolean);
                return (
                <tr key={va.vaId}>
                  <td style={td}><div style={{ fontWeight: 600 }}>{va.name}</div><div className="small">{va.email}</div></td>
                  <td style={td}>
                    {ageDays == null ? <span className="small">never</span> : (
                      <span className="small" style={{ color: ageDays > 30 ? "var(--color-error)" : undefined }}>{ageDays}d ago</span>
                    )}
                  </td>
                  <td style={td}>{thisMonth ? <Badge variant="success" dot>Done</Badge> : <Badge variant="warning" dot>Pending</Badge>}</td>
                  <td style={td}>
                    {days.length === 0 ? <span className="small" style={{ color: "var(--color-text-tertiary)" }}>—</span> : (
                      <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                        {days.map((d) => <Badge key={d} size="sm">{d}</Badge>)}
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, whiteSpace: "normal", maxWidth: 220 }}>
                    {va.availabilityNotes ? (
                      <span className="small" style={truncate} title={va.availabilityNotes}>{va.availabilityNotes}</span>
                    ) : <span className="small" style={{ color: "var(--color-text-tertiary)" }}>—</span>}
                  </td>
                  <td style={{ ...td, whiteSpace: "normal", maxWidth: 220 }}>
                    {va.lastCheckinNotes ? (
                      <span className="small" style={truncate} title={va.lastCheckinNotes}>{va.lastCheckinNotes}</span>
                    ) : <span className="small" style={{ color: "var(--color-text-tertiary)" }}>—</span>}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

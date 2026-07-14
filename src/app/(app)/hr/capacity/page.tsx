import { getCapacity } from "@/lib/reads/hr-extra";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ActionButton } from "@/components/ActionButton";

export const dynamic = "force-dynamic";

const head: React.CSSProperties = { padding: "16px 20px", borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-secondary)" };
const title: React.CSSProperties = { fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", margin: 0 };
const rowS: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1px solid var(--color-border-subtle)" };

function formatTarget(targetHoursWeekly: number | null | undefined) {
  return `${targetHoursWeekly ?? 0}h/wk target`;
}

function formatExpected14d(targetHoursWeekly: number | null | undefined) {
  return `${((targetHoursWeekly ?? 0) * 2).toFixed(1)}h expected / 2wk`;
}

export default async function CapacityPage() {
  const { flagged, events } = await getCapacity();
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">HR · Daily</div>
          <h1>Capacity alerts</h1>
        </div>
        <span className="small">{flagged.length} flagged</span>
      </div>

      <Card padding={0} style={{ overflow: "hidden", marginBottom: 24 }} tourEl="/hr/capacity">
        <div style={head}><h2 style={title}>Currently flagged</h2></div>
        {flagged.length === 0 ? (
          <div style={{ padding: 24, fontStyle: "italic", color: "var(--color-text-tertiary)" }}>No VAs currently flagged.</div>
        ) : (
          flagged.map((c) => (
            <div key={c.va.vaId} style={rowS}>
              <div>
                <div style={{ fontWeight: 600 }}>{c.va.name}</div>
                <div className="small">
                  {Math.round(c.utilizationPct)}% utilization · {c.last14dHours.toFixed(1)}h logged · {c.atWork14dHours.toFixed(1)}h at work / 2wk · {formatExpected14d(c.va.targetHoursWeekly)} · {formatTarget(c.va.targetHoursWeekly)}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Badge variant={c.overburdened ? "danger" : "warning"} dot>{c.overburdened ? "Overburdened" : "Underutilized"}</Badge>
                <ActionButton path="/api/hr/resolve-capacity" body={{ vaId: c.va.vaId, notes: "Reviewed via console" }} variant="ghost">
                  Mark reviewed
                </ActionButton>
              </div>
            </div>
          ))
        )}
      </Card>

      <Card padding={0} style={{ overflow: "hidden" }}>
        <div style={head}><h2 style={title}>Recent flag history</h2></div>
        {events.length === 0 ? (
          <div style={{ padding: 24, fontStyle: "italic", color: "var(--color-text-tertiary)" }}>No history.</div>
        ) : (
          events.map((e) => (
            <div key={e.id} style={rowS}>
              <div>
                <div style={{ fontWeight: 600 }}>{e.vaName ?? e.vaId}</div>
                <div className="small">{e.flagType} · {e.transition}</div>
              </div>
              <span className="small" style={{ color: "var(--color-text-tertiary)" }}>{e.timestamp.toLocaleDateString()}</span>
            </div>
          ))
        )}
      </Card>
    </>
  );
}

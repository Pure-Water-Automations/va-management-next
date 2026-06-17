import { getCurrentUser } from "@/lib/auth/access";
import { isGateReviewer } from "@/lib/auth/roles";
import { getHrDashboard } from "@/lib/reads/hr";
import { Stat } from "@/components/ui/Stat";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function HrDashboard() {
  const user = await getCurrentUser();
  if (!isGateReviewer(user.role) && user.role !== "BOOKKEEPER") {
    // HR / People-Ops / Team-Lead land here; others are routed by /.
  }
  const d = await getHrDashboard();

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">HR Operations</div>
          <h1>VA operations console</h1>
        </div>
      </div>

      <div className="stat-grid" data-tour-el="/hr">
        <Stat
          label="Pending tier reviews"
          value={d.pendingReviews.length}
          variant={d.pendingReviews.length ? "navy" : "default"}
        />
        <Stat label="Active VAs" value={d.totalActive} />
        <Stat
          label="Capacity flags"
          value={d.capacityFlags.length}
          trend={d.capacityFlags.length ? "down" : "neutral"}
        />
        <Stat
          label="Check-ins this month"
          value={d.checkinsThisMonth}
          unit={`/ ${d.totalActive}`}
        />
      </div>

      <div className="dash-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <Panel title="Pending tier reviews" hint="Oldest first">
            {d.pendingReviews.length === 0 ? (
              <Empty>No tier reviews waiting.</Empty>
            ) : (
              d.pendingReviews.map((r) => (
                <Row key={r.id}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{r.vaName ?? r.vaId}</div>
                    <div className="small">
                      {r.currentRole} → {r.targetRole ?? "next"} · {Math.round(r.cumulativeHoursAtTrigger ?? 0)}h
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="small">{r.daysWaiting}d waiting</span>
                    <Badge variant={statusVariant(r.status)}>{r.status.replace(/_/g, " ")}</Badge>
                  </div>
                </Row>
              ))
            )}
          </Panel>

          <Panel title="Capacity attention" hint="Workload health">
            {d.capacityFlags.length === 0 ? (
              <Empty>No capacity flags.</Empty>
            ) : (
              d.capacityFlags.map((c) => (
                <Row key={c.va.vaId}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{c.va.name}</div>
                    <div className="small">
                      {Math.round(c.utilizationPct)}% utilization · {c.last14dHours.toFixed(1)}h / 2wk
                    </div>
                  </div>
                  <Badge variant={c.overburdened ? "danger" : "warning"} dot>
                    {c.overburdened ? "Overburdened" : "Underutilized"}
                  </Badge>
                </Row>
              ))
            )}
          </Panel>

          <Panel title="Efficiency watch" hint={`activity %, rolling window`}>
            {d.efficiencyAlerts.length === 0 ? (
              <Empty>All monitored VAs above threshold.</Empty>
            ) : (
              d.efficiencyAlerts.map((e) => (
                <Row key={e.va.vaId}>
                  <div style={{ fontWeight: 600 }}>{e.va.name}</div>
                  <Badge variant={e.flag === "RED" ? "danger" : "warning"} dot>
                    {e.avgActivity.toFixed(0)}% avg
                  </Badge>
                </Row>
              ))
            )}
          </Panel>
        </div>

        <Card padding={0} style={{ overflow: "hidden" }}>
          <div style={panelHead}>
            <h2 style={panelTitle}>Recent activity</h2>
          </div>
          <div style={{ padding: 8 }}>
            {d.recentActivity.length === 0 ? (
              <Empty>No activity yet.</Empty>
            ) : (
              d.recentActivity.map((a) => (
                <div
                  key={a.id}
                  style={{ display: "flex", gap: 10, padding: "10px 12px", borderBottom: "1px dashed var(--color-border-subtle)" }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      marginTop: 6,
                      flexShrink: 0,
                      background: dotColor(a.severity),
                    }}
                  />
                  <div>
                    <div style={{ fontSize: "var(--text-sm)" }}>{a.summary}</div>
                    <div className="small" style={{ color: "var(--color-text-tertiary)" }}>
                      {a.source} · {a.timestamp.toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

const panelHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "16px 20px",
  borderBottom: "1px solid var(--color-border)",
  background: "var(--color-bg-secondary)",
};
const panelTitle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "var(--text-xl)",
  fontWeight: 600,
  margin: 0,
};

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card padding={0} style={{ overflow: "hidden" }}>
      <div style={panelHead}>
        <h2 style={panelTitle}>{title}</h2>
        {hint && <span className="small" style={{ color: "var(--color-text-tertiary)" }}>{hint}</span>}
      </div>
      <div>{children}</div>
    </Card>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: "14px 20px",
        borderBottom: "1px solid var(--color-border-subtle)",
      }}
    >
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 24, color: "var(--color-text-tertiary)", fontStyle: "italic" }}>{children}</div>
  );
}

function statusVariant(s: string): "warning" | "info" | "primary" {
  if (s === "hours_triggered") return "warning";
  if (s === "form_sent") return "info";
  return "primary";
}

function dotColor(sev: string): string {
  if (sev === "success") return "var(--color-success)";
  if (sev === "warning") return "var(--color-warning)";
  if (sev === "error") return "var(--color-error)";
  return "var(--color-sky-500)";
}

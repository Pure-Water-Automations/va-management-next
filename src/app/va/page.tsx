import { getCurrentUser } from "@/lib/auth/access";
import { getVaDashboard } from "@/lib/reads/va";
import { Stat } from "@/components/ui/Stat";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function VaConsole() {
  const user = await getCurrentUser();
  if (!user.vaId) {
    return (
      <div className="page-head">
        <div>
          <h1>VA console</h1>
          <p className="small">Your login isn’t linked to a VA record yet. Ask HR to connect it.</p>
        </div>
      </div>
    );
  }
  const d = await getVaDashboard(user.vaId);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">My Console</div>
          <h1>Hi, {d.va.name.split(" ")[0]}</h1>
        </div>
        {d.checkinDue && <Badge variant="warning" dot>Monthly check-in due</Badge>}
      </div>

      <div className="stat-grid">
        <Stat label="Hours · last 7 days" value={d.last7.toFixed(1)} unit="h" />
        <Stat label="Hours · last 14 days" value={d.last14.toFixed(1)} unit="h" />
        <Stat label="Cumulative hours" value={Math.round(d.cumulative)} unit="h" variant="navy" />
        <Stat
          label="Utilization"
          value={`${Math.round(d.utilizationPct)}`}
          unit="%"
          trend={d.flags.overburdened ? "down" : "neutral"}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 24 }}>
        <Card>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", margin: "0 0 12px" }}>
            Tier progress
          </h2>
          <div className="small" style={{ marginBottom: 8 }}>
            Current role: <strong style={{ color: "var(--color-text-primary)" }}>{d.va.compensationRole}</strong>
          </div>
          {d.role?.nextRoleId ? (
            <>
              <div className="small">Next: {d.role.nextRoleId}</div>
              {d.hoursToNext != null && (
                <div style={{ marginTop: 8 }}>
                  {d.eligibility.eligible ? (
                    <Badge variant="success" dot>Eligible — pending HR review</Badge>
                  ) : (
                    <span className="small">
                      {d.hoursToNext.toFixed(0)}h to eligibility threshold
                    </span>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="small">Top of the current ladder.</div>
          )}
        </Card>

        <Card>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", margin: "0 0 12px" }}>
            Recent activity
          </h2>
          {d.myActivity.length === 0 ? (
            <div className="small">No recent activity.</div>
          ) : (
            d.myActivity.map((a) => (
              <div key={a.id} style={{ padding: "8px 0", borderBottom: "1px dashed var(--color-border-subtle)" }}>
                <div style={{ fontSize: "var(--text-sm)" }}>{a.summary}</div>
                <div className="small" style={{ color: "var(--color-text-tertiary)" }}>
                  {a.timestamp.toLocaleDateString()}
                </div>
              </div>
            ))
          )}
        </Card>
      </div>
    </>
  );
}

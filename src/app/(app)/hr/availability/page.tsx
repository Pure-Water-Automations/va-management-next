import { getAvailability } from "@/lib/reads/hr-extra";
import { hourLabel } from "@/lib/services/availability";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

const head: React.CSSProperties = { padding: "16px 20px", borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-secondary)" };
const title: React.CSSProperties = { fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", margin: 0 };
const rowS: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1px solid var(--color-border-subtle)" };

export default async function AvailabilityPage() {
  const { currentHour, availableNow, noWindowSet } = await getAvailability();
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">HR · Daily</div>
          <h1>Who's available now</h1>
        </div>
        <span className="small">{hourLabel(currentHour)} EST right now</span>
      </div>

      <Card padding={0} style={{ overflow: "hidden", marginBottom: 24 }} tourEl="/hr/availability">
        <div style={head}><h2 style={title}>Available now</h2></div>
        {availableNow.length === 0 ? (
          <div style={{ padding: 24, fontStyle: "italic", color: "var(--color-text-tertiary)" }}>No one has reported being typically available at this hour.</div>
        ) : (
          availableNow.map((r) => (
            <div key={r.va.vaId} style={rowS}>
              <div>
                <div style={{ fontWeight: 600 }}>{r.va.name}</div>
                <div className="small">
                  {hourLabel(r.va.availabilityStartHourEst!)} – {hourLabel(r.va.availabilityEndHourEst!)} EST
                  {r.va.availabilityNotes ? ` · ${r.va.availabilityNotes}` : ""}
                </div>
              </div>
              <Badge variant="success" dot>Available</Badge>
            </div>
          ))
        )}
      </Card>

      {noWindowSet.length > 0 && (
        <Card padding={0} style={{ overflow: "hidden" }}>
          <div style={head}><h2 style={title}>No availability window set</h2></div>
          <div style={{ padding: "10px 20px", fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>
            These VAs haven't reported a typical daily availability window in their check-in yet.
          </div>
          {noWindowSet.map((r) => (
            <div key={r.va.vaId} style={rowS}>
              <div style={{ fontWeight: 600 }}>{r.va.name}</div>
              <div className="small">{r.va.email}</div>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

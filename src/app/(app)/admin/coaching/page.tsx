import { redirect } from "next/navigation";
import { getCurrentUser, isAllAccess } from "@/lib/auth/access";
import { getCapacityCoaching } from "@/lib/coaching";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

function hrs(h: number | null): string {
  if (h == null) return "—";
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

export default async function CoachingPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await getCurrentUser();
  if (!isAllAccess(user)) redirect("/");

  const days = Number((await searchParams).days) || 30;
  const c = await getCapacityCoaching(days);
  const s = c.stats;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Admin · Insights</div>
          <h1>Capacity Coaching</h1>
        </div>
      </div>

      <Card style={{ marginBottom: 8 }}>
        <p className="small" style={{ margin: 0 }}>
          Are managers acting on the capacity signals the console raises? Last {days} days.{" "}
          {[7, 30, 90].map((d) => (
            <a key={d} href={`/admin/coaching?days=${d}`} style={{ marginLeft: 8 }}>
              {d}d
            </a>
          ))}
        </p>
      </Card>

      <Card style={{ marginBottom: 8 }}>
        <h3>Responsiveness</h3>
        <table className="table">
          <tbody>
            <tr><td>Flags raised</td><td style={{ textAlign: "right" }}>{s.raised}</td></tr>
            <tr><td>Resolved</td><td style={{ textAlign: "right" }}>{s.resolved}</td></tr>
            <tr><td>Still open</td><td style={{ textAlign: "right" }}>{s.open}</td></tr>
            <tr><td>Never viewed by HR</td><td style={{ textAlign: "right" }}>{s.neverViewed}</td></tr>
            <tr><td>Manually reviewed (HR acted)</td><td style={{ textAlign: "right" }}>{s.manuallyReviewed}</td></tr>
            <tr><td>Median time to first HR view</td><td style={{ textAlign: "right" }}>{hrs(s.medianHoursToView)}</td></tr>
            <tr><td>Median time to resolve</td><td style={{ textAlign: "right" }}>{hrs(s.medianHoursToResolve)}</td></tr>
            <tr><td>Oldest open flag</td><td style={{ textAlign: "right" }}>{hrs(s.oldestOpenHours)}</td></tr>
          </tbody>
        </table>
        <p className="small" style={{ marginBottom: 0 }}>
          &ldquo;Viewed&rdquo; means an HR user opened the Capacity Alerts page after the flag was raised — the page
          lists all flags, so it&apos;s a proxy for &ldquo;saw it,&rdquo; not proof they acted on that specific VA.
        </p>
      </Card>

      <Card style={{ marginBottom: 8 }}>
        <h3>HR engagement with capacity signals</h3>
        <table className="table">
          <thead>
            <tr>
              <th>HR user</th>
              <th style={{ textAlign: "right" }}>Visits</th>
              <th style={{ textAlign: "right" }}>Per week</th>
              <th style={{ textAlign: "right" }}>Last visit</th>
              <th style={{ textAlign: "right" }}>Days ago</th>
            </tr>
          </thead>
          <tbody>
            {c.hrEngagement.length === 0 && (
              <tr><td colSpan={5} className="small">No HR visits to the Capacity Alerts page in this window.</td></tr>
            )}
            {c.hrEngagement.map((h) => (
              <tr key={h.name}>
                <td>{h.name}</td>
                <td style={{ textAlign: "right" }}>{h.visits}</td>
                <td style={{ textAlign: "right" }}>{h.visitsPerWeek.toFixed(1)}</td>
                <td style={{ textAlign: "right" }}>{h.lastVisit ? h.lastVisit.toISOString().slice(0, 10) : "—"}</td>
                <td style={{ textAlign: "right" }}>{h.daysSinceLastVisit != null ? Math.round(h.daysSinceLastVisit) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <h3>Open flags needing attention</h3>
        <table className="table">
          <thead>
            <tr>
              <th>VA</th>
              <th>Flag</th>
              <th>Severity</th>
              <th style={{ textAlign: "right" }}>Raised</th>
              <th style={{ textAlign: "right" }}>Open for</th>
              <th style={{ textAlign: "right" }}>Seen?</th>
            </tr>
          </thead>
          <tbody>
            {c.attention.length === 0 && (
              <tr><td colSpan={6} className="small">No open capacity flags. 🎉</td></tr>
            )}
            {c.attention.map((f, i) => (
              <tr key={`${f.vaName}-${i}`}>
                <td>{f.vaName}</td>
                <td>{f.flagType}</td>
                <td>{f.severity}</td>
                <td style={{ textAlign: "right" }}>{f.raisedAt.toISOString().slice(0, 10)}</td>
                <td style={{ textAlign: "right" }}>{hrs(f.openHours)}</td>
                <td style={{ textAlign: "right" }}>{f.hoursToView != null ? "yes" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

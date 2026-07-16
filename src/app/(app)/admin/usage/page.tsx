import { redirect } from "next/navigation";
import { getCurrentUser, isAllAccess } from "@/lib/auth/access";
import { getUsageSummary } from "@/lib/pageview";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default async function UsagePage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await getCurrentUser();
  if (!isAllAccess(user)) redirect("/");

  const days = Number((await searchParams).days) || 30;
  const summary = await getUsageSummary(days);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Admin · Settings</div>
          <h1>Console Usage</h1>
        </div>
      </div>

      <Card style={{ marginBottom: 8 }}>
        <p className="small" style={{ margin: 0 }}>
          {summary.total} page views in the last {days} days.{" "}
          {[7, 30, 90].map((d) => (
            <a key={d} href={`/admin/usage?days=${d}`} style={{ marginLeft: 8 }}>
              {d}d
            </a>
          ))}
        </p>
      </Card>

      <Card style={{ marginBottom: 8 }}>
        <h3>Top pages</h3>
        <table className="table">
          <tbody>
            {summary.topPaths.map((p) => (
              <tr key={p.path}>
                <td>{p.path}</td>
                <td style={{ textAlign: "right" }}>{p.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card style={{ marginBottom: 8 }}>
        <h3>By console view</h3>
        <table className="table">
          <tbody>
            {summary.byRole.map((r) => (
              <tr key={r.role}>
                <td>{r.role}</td>
                <td style={{ textAlign: "right" }}>{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card style={{ marginBottom: 8 }}>
        <h3>Most active users</h3>
        <table className="table">
          <tbody>
            {summary.byUser.map((u) => (
              <tr key={u.userId}>
                <td>{u.name}</td>
                <td style={{ textAlign: "right" }}>{u.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card style={{ marginBottom: 8 }}>
        <h3>Who visits what</h3>
        <p className="small" style={{ marginTop: 0 }}>Top user × page combinations — who actually opens each screen, and when they last did.</p>
        <table className="table">
          <thead>
            <tr>
              <th>User</th>
              <th>Page</th>
              <th style={{ textAlign: "right" }}>Visits</th>
              <th style={{ textAlign: "right" }}>Last visit</th>
            </tr>
          </thead>
          <tbody>
            {summary.byUserPath.map((r) => (
              <tr key={`${r.name}|${r.path}`}>
                <td>{r.name}</td>
                <td>{r.path}</td>
                <td style={{ textAlign: "right" }}>{r.count}</td>
                <td style={{ textAlign: "right" }}>{r.lastVisit ? r.lastVisit.toISOString().slice(0, 10) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <h3>Daily page views</h3>
        <table className="table">
          <tbody>
            {summary.dailyActive.map((d) => (
              <tr key={d.day.toISOString()}>
                <td>{d.day.toISOString().slice(0, 10)}</td>
                <td style={{ textAlign: "right" }}>{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

import { getCurrentUser } from "@/lib/auth/access";
import { canManageTasks } from "@/lib/auth/roles";
import { getProjectsList } from "@/lib/reads/projects";
import { Stat } from "@/components/ui/Stat";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function HrProjectsPage() {
  const user = await getCurrentUser();
  if (!canManageTasks(user.role)) {
    return <p style={{ padding: 32 }}>Not authorized.</p>;
  }

  const projects = await getProjectsList();

  const activeCount = projects.filter((p) => p.status === "Active").length;
  const openTaskCount = projects.reduce((s, p) => s + p.openTaskCount, 0);
  const overdueCount = projects.filter(
    (p) => p.dueDate && p.dueDate < new Date() && p.status !== "Done",
  ).length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Projects</div>
          <h1>Projects</h1>
        </div>
        <a href="/hr/tasks/new" className="btn btn-primary" style={{ alignSelf: "center" }}>
          + Delegate Task
        </a>
      </div>

      <div className="stat-grid">
        <Stat label="Active projects" value={activeCount} variant={activeCount ? "navy" : "default"} />
        <Stat label="Open tasks" value={openTaskCount} />
        <Stat label="Overdue projects" value={overdueCount} trend={overdueCount ? "down" : "neutral"} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 24 }}>
        {projects.length === 0 ? (
          <p style={{ color: "var(--color-text-tertiary)", fontStyle: "italic" }}>No projects yet.</p>
        ) : (
          projects.map((p) => (
            <Card key={p.id} padding={20}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <a
                    href={`/hr/projects/${p.id}`}
                    style={{ fontWeight: 600, fontSize: "var(--text-base)", textDecoration: "none" }}
                  >
                    {p.name}
                  </a>
                  {p.client && (
                    <span className="small" style={{ marginLeft: 8, color: "var(--color-text-tertiary)" }}>
                      {p.client}
                    </span>
                  )}
                  <div className="small" style={{ marginTop: 4, color: "var(--color-text-secondary)" }}>
                    {p.owner.name ?? p.owner.email} ·{" "}
                    {p.dueDate ? `Due ${p.dueDate.toLocaleDateString()}` : "No due date"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Badge variant={p.priority === "High" ? "danger" : p.priority === "Medium" ? "warning" : "default"}>
                    {p.priority}
                  </Badge>
                  <Badge variant={p.status === "Active" ? "primary" : p.status === "Done" ? "info" : "default"}>
                    {p.status}
                  </Badge>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    height: 6,
                    borderRadius: 4,
                    background: "var(--color-border)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${p.progress}%`,
                      background: "var(--color-sky-500)",
                      borderRadius: 4,
                      transition: "width 0.3s",
                    }}
                  />
                </div>
                <div className="small" style={{ marginTop: 4, color: "var(--color-text-tertiary)" }}>
                  {p.progress}% complete · {p.openTaskCount} open tasks
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </>
  );
}

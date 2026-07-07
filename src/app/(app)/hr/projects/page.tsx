import { getCurrentUser, isBetaVisible } from "@/lib/auth/access";
import { canManageTasks, canManageProjects } from "@/lib/auth/roles";
import { getProjectsList } from "@/lib/reads/projects";
import { db } from "@/lib/db";
import { Stat } from "@/components/ui/Stat";
import { Card } from "@/components/ui/Card";
import { StatusBadge, PriorityBadge, DueChip, EmptyState } from "@/components/ui/task-format";
import { DiscoverButton } from "@/components/DiscoverButton";
import { NewProjectModal } from "@/components/hub/NewProjectModal";

export const dynamic = "force-dynamic";

export default async function HrProjectsPage() {
  const user = await getCurrentUser();
  if (!canManageTasks(user.role)) {
    return <p style={{ padding: 32 }}>Not authorized.</p>;
  }

  const projects = await getProjectsList();
  const canCreate = user.isAdmin || canManageProjects(user.role);
  const betaVisible = await isBetaVisible(user.email);

  const activeCount = projects.filter((p) => p.status === "Active").length;
  const openTaskCount = projects.reduce((s, p) => s + p.openTaskCount, 0);
  const overdueCount = projects.filter(
    (p) => p.dueDate && p.dueDate < new Date() && p.status !== "Done",
  ).length;

  // OS Hub stat cards (design: Library pages + pending Meeting actions) and
  // the New Project modal's owner/client options.
  const [libraryPages, pendingMeeting, owners, orgs] = await Promise.all([
    db.page.count({ where: { scope: "LIBRARY" } }),
    db.meetingActionItem.count({ where: { status: "PENDING" } }),
    db.user.findMany({
      where: { active: true, role: { notIn: ["CLIENT_ADMIN", "CLIENT_MEMBER"] } },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    db.clientOrganization.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Projects</div>
          <h1>Projects</h1>
        </div>
        <div style={{ display: "flex", gap: 8, alignSelf: "center" }}>
          {betaVisible && <DiscoverButton />}
          {canCreate && (
            <NewProjectModal
              owners={owners.map((o) => ({ id: o.id, label: o.name ?? o.email ?? o.id }))}
              clients={orgs.map((o) => o.name)}
              meId={user.id}
            />
          )}
          <a href="/hr/tasks/new" className="btn btn-primary">
            + Delegate Task
          </a>
        </div>
      </div>

      <div className="stat-grid">
        <Stat label="Active projects" value={activeCount} variant={activeCount ? "navy" : "default"} />
        <Stat label="Open tasks" value={openTaskCount} />
        <Stat label="Overdue projects" value={overdueCount} trend={overdueCount ? "down" : "neutral"} />
        <Stat label="Library pages" value={libraryPages} />
        <Stat label="Meeting actions pending" value={pendingMeeting} trend={pendingMeeting ? "down" : "neutral"} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 24 }}>
        {projects.length === 0 ? (
          <EmptyState
            title="No projects yet"
            hint="Create your first project to start delegating work."
            {...(canCreate ? { ctaHref: "/hr/projects/new", ctaLabel: "+ New project" } : {})}
          />
        ) : (
          projects.map((p) => (
            <Card key={p.id} padding={20} className="hub-lift">
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
                  <div className="small" style={{ marginTop: 4, color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span>{p.owner.name ?? p.owner.email}</span>
                    <span>·</span>
                    <DueChip date={p.dueDate} status={p.status} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <PriorityBadge value={p.priority} />
                  <StatusBadge value={p.status} kind="project" />
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

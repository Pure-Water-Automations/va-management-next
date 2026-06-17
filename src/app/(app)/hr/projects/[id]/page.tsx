import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { canManageProjects, canManageTasks } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { getProjectDetail, getProjectActivityFeed } from "@/lib/reads/projects";
import { computeProjectProgress } from "@/lib/services/tasks";
import { Stat } from "@/components/ui/Stat";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge, DueChip, Avatar } from "@/components/ui/task-format";
import { ProjectCommentForm } from "@/components/ProjectCommentForm";
import { ProjectStatusControls } from "@/components/ProjectStatusControls";
import { ProjectQuickAddTask } from "@/components/ProjectQuickAddTask";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user.isAdmin && !canManageTasks(user.role)) {
    redirect("/hr/projects");
  }
  const canEdit = user.isAdmin || canManageProjects(user.role);

  const [project, feed, assignees] = await Promise.all([
    getProjectDetail(id),
    getProjectActivityFeed(id),
    db.user.findMany({
      where: { role: { in: ["VA", "SENIOR_VA"] }, active: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!project) return <p style={{ padding: 32 }}>Project not found.</p>;

  const progress = computeProjectProgress(project.tasks);
  const openTaskCount = project.tasks.filter((t) => t.status !== "Done").length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            <a href="/hr/projects">Projects</a> / {project.name}
          </div>
          <h1>{project.name}</h1>
          {project.client && (
            <span className="small" style={{ color: "var(--color-text-tertiary)" }}>
              {project.client}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", alignSelf: "center" }}>
          <ProjectStatusControls
            projectId={project.id}
            status={project.status}
            priority={project.priority}
            canEdit={canEdit}
          />
          {canEdit && (
            <Button href={`/hr/projects/${id}/edit`} variant="ghost" size="sm">
              Edit
            </Button>
          )}
        </div>
      </div>

      {project.description && (
        <p style={{ marginBottom: 24, color: "var(--color-text-secondary)" }}>{project.description}</p>
      )}

      <div className="stat-grid">
        <Stat label="Progress" value={progress} unit="%" variant={progress === 100 ? "navy" : "default"} />
        <Stat label="Total tasks" value={project.tasks.length} />
        <Stat label="Open tasks" value={openTaskCount} trend={openTaskCount ? "down" : "neutral"} />
        <Stat
          label="Owner"
          value={<span style={{ fontSize: "var(--text-lg)" }}>{project.owner.name ?? project.owner.email}</span>}
        />
      </div>

      <div className="dash-grid">
        {/* Task list */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Tasks</h2>
            <span className="small" style={{ color: "var(--color-text-tertiary)" }}>
              {progress}% complete
            </span>
          </div>
          <ProjectQuickAddTask projectId={project.id} assignees={assignees} />
          {project.tasks.length === 0 ? (
            <p style={{ color: "var(--color-text-tertiary)", fontStyle: "italic" }}>No tasks yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {project.tasks.map((t) => (
                <Card key={t.id} padding={16}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <a
                        href={`/hr/tasks/${t.id}`}
                        style={{ fontWeight: 600, textDecoration: "none" }}
                      >
                        {t.title}
                      </a>
                      <div
                        className="small"
                        style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 8 }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <Avatar name={t.assignedTo.name} size={20} />
                          <span style={{ color: "var(--color-text-tertiary)" }}>
                            {t.assignedTo.name ?? "Unassigned"}
                          </span>
                        </span>
                        <span style={{ color: "var(--color-text-tertiary)" }}>·</span>
                        <DueChip date={t.dueDate} status={t.status} />
                      </div>
                    </div>
                    <StatusBadge value={t.status} />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Activity feed + project note form */}
        <Card padding={0} style={{ overflow: "hidden" }}>
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--color-border)",
              background: "var(--color-bg-secondary)",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "var(--text-xl)" }}>Activity</h2>
          </div>
          <ProjectCommentForm projectId={project.id} />
          <div style={{ padding: 8, borderTop: "1px solid var(--color-border-subtle)" }}>
            {feed.length === 0 ? (
              <p
                style={{
                  padding: 24,
                  color: "var(--color-text-tertiary)",
                  fontStyle: "italic",
                }}
              >
                No activity yet.
              </p>
            ) : (
              feed.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px dashed var(--color-border-subtle)",
                  }}
                >
                  <div style={{ fontSize: "var(--text-sm)" }}>{item.summary}</div>
                  <div className="small" style={{ color: "var(--color-text-tertiary)", marginTop: 2 }}>
                    {item.at.toLocaleDateString()}
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

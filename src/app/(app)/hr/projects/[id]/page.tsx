import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, isBetaVisible } from "@/lib/auth/access";
import { canManageProjects, canManageTasks } from "@/lib/auth/roles";
import { getProjectDetail, getProjectActivityFeed } from "@/lib/reads/projects";
import { getDelegationAssignees } from "@/lib/reads/assignees";
import { computeProjectProgress } from "@/lib/services/tasks";
import { Stat } from "@/components/ui/Stat";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge, DueChip, Avatar } from "@/components/ui/task-format";
import { ProjectCommentForm } from "@/components/ProjectCommentForm";
import { ProjectStatusControls } from "@/components/ProjectStatusControls";
import { ProjectQuickAddTask } from "@/components/ProjectQuickAddTask";
import { EnhanceButton } from "@/components/EnhanceButton";
import { NotionItemControls } from "@/components/NotionItemControls";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user.isAdmin && !canManageTasks(user.role)) {
    redirect("/hr/projects");
  }
  const canEdit = user.isAdmin || canManageProjects(user.role);

  // Auto-suggest: VAs assigned to this project's client float to the top of the picker.
  const projectClientId = (await db.project.findUnique({ where: { id }, select: { clientOrganizationId: true } }))?.clientOrganizationId ?? null;
  const [project, feed, assignees] = await Promise.all([
    getProjectDetail(id),
    getProjectActivityFeed(id),
    getDelegationAssignees(projectClientId),
  ]);

  if (!project) return <p style={{ padding: 32 }}>Project not found.</p>;

  const progress = computeProjectProgress(project.tasks);
  const openTaskCount = project.tasks.filter((t) => t.status !== "Done").length;
  const betaVisible = await isBetaVisible(user.email);

  // Notion sync (beta): linked-page info + whether this client has a projects connection.
  const notionInfo = betaVisible
    ? await db.project.findUnique({
        where: { id },
        select: {
          notionUrl: true,
          notionStatus: true,
          clientOrganizationId: true,
          clientOrganization: { select: { notionConnection: { select: { active: true, projectsDataSourceId: true } } } },
        },
      })
    : null;
  const notionConnected =
    !!notionInfo?.clientOrganization?.notionConnection?.active &&
    !!notionInfo.clientOrganization.notionConnection.projectsDataSourceId;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            <Link href="/hr/projects">Projects</Link> / {project.name}
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
          {betaVisible && (
            <EnhanceButton projectId={project.id} projectName={project.name} assignees={assignees} />
          )}
          {betaVisible && notionInfo?.clientOrganizationId && (
            <NotionItemControls
              kind="project"
              id={project.id}
              notionUrl={notionInfo.notionUrl}
              notionStatus={notionInfo.notionStatus}
              connected={notionConnected}
            />
          )}
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
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: "var(--text-sm)" }}>{item.summary}</span>
                    {item.visibility === "CLIENT_VISIBLE" && (
                      <span
                        style={{
                          fontSize: "var(--text-xs)",
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: "#dbeafe",
                          color: "#1d4ed8",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Client visible
                      </span>
                    )}
                    {item.visibility === "INTERNAL_ONLY" && (
                      <span
                        style={{
                          fontSize: "var(--text-xs)",
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: "#f3f4f6",
                          color: "#6b7280",
                          fontWeight: 500,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Internal
                      </span>
                    )}
                  </div>
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

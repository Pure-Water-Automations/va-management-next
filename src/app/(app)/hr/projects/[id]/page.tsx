import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/access";
import { canManageProjects, canManageTasks } from "@/lib/auth/roles";
import { getProjectDetail } from "@/lib/reads/projects";
import { getDelegationAssignees } from "@/lib/reads/assignees";
import { getProjectFieldPills } from "@/lib/reads/fields";
import { getPageTree, getPageDoc } from "@/lib/reads/pages";
import { getScratchItems } from "@/lib/reads/scratch";
import { ensureOverviewPage } from "@/lib/actions/pages";
import { computeProjectProgress } from "@/lib/services/tasks";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge, DueChip, Avatar } from "@/components/ui/task-format";
import { ProjectStatusControls } from "@/components/ProjectStatusControls";
import { ProjectQuickAddTask } from "@/components/ProjectQuickAddTask";
import { PropertyPills } from "@/components/hub/PropertyPills";
import { PageTree } from "@/components/hub/PageTree";
import { BlockEditor } from "@/components/hub/BlockEditor";
import { Scratchpad } from "@/components/hub/Scratchpad";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * OS Hub project page (Sprint 1, Phase 2): tree | doc/tasks tabs. The old
 * detail remains at ./classic during the test period (feature-parity rule).
 */
export default async function ProjectHubPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const { id } = await params;
  const { tab: rawTab, page: rawPage } = await searchParams;
  const user = await getCurrentUser();
  if (!user.isAdmin && !canManageTasks(user.role)) {
    redirect("/hr/projects");
  }
  const canEdit = user.isAdmin || canManageTasks(user.role);
  const canShare = user.isAdmin || canManageProjects(user.role);

  await ensureOverviewPage(user.id, id);

  const projectClientId =
    (await db.project.findUnique({ where: { id }, select: { clientOrganizationId: true } }))
      ?.clientOrganizationId ?? null;

  const [project, fieldPills, tree, assignees] = await Promise.all([
    getProjectDetail(id),
    getProjectFieldPills(id),
    getPageTree("PROJECT", id),
    getDelegationAssignees(projectClientId),
  ]);
  if (!project) return <p style={{ padding: 32 }}>Project not found.</p>;

  const tab = rawTab === "tasks" ? "tasks" : rawTab === "scratch" ? "scratch" : "page";
  const activePageId = rawPage && tree.some((n) => n.id === rawPage) ? rawPage : tree[0]?.id;
  const doc = tab === "page" && activePageId ? await getPageDoc(activePageId) : null;
  const scratch = tab === "scratch" ? await getScratchItems(id) : [];

  const progress = computeProjectProgress(project.tasks);
  const openTaskCount = project.tasks.filter((t) => t.status !== "Done").length;
  const base = `/hr/projects/${id}`;

  const tabLink = (t: "page" | "tasks" | "scratch", label: string, count?: number) => (
    <Link
      href={`${base}?tab=${t}${t === "page" && activePageId ? `&page=${activePageId}` : ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "9px 16px",
        fontSize: "var(--text-sm)",
        fontWeight: tab === t ? 600 : 500,
        color: tab === t ? "var(--color-navy-900, #0f1c5e)" : "var(--color-text-tertiary)",
        borderBottom: `2px solid ${tab === t ? "var(--color-sky-500, #2eb4dd)" : "transparent"}`,
        marginBottom: -1,
        textDecoration: "none",
      }}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span
          style={{
            fontSize: "var(--text-xs)",
            fontWeight: 700,
            background: "var(--color-sky-50, #f0fafd)",
            color: "var(--color-sky-700, #177a9c)",
            borderRadius: 999,
            padding: "1px 7px",
          }}
        >
          {count}
        </span>
      )}
    </Link>
  );

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
        <div style={{ display: "flex", gap: 8, alignItems: "center", alignSelf: "center", flexWrap: "wrap" }}>
          <ProjectStatusControls
            projectId={project.id}
            status={project.status}
            priority={project.priority}
            canEdit={canShare}
          />
          <Button href={`${base}/classic`} variant="ghost" size="sm">
            Classic view
          </Button>
          {canShare && (
            <Button href={`${base}/edit`} variant="ghost" size="sm">
              Edit
            </Button>
          )}
        </div>
      </div>

      <PropertyPills projectId={project.id} fields={fieldPills} canEdit={canEdit} />

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--color-border-subtle)", marginBottom: 20 }}>
        {tabLink("page", "Page")}
        {tabLink("tasks", "Tasks", openTaskCount)}
        {tabLink("scratch", "Scratchpad")}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: tab === "page" ? "210px minmax(0, 1fr)" : "minmax(0, 1fr)",
          gap: 22,
          alignItems: "start",
        }}
      >
        {tab === "page" && (
          <PageTree
            nodes={tree}
            activePageId={activePageId ?? ""}
            baseHref={base}
            projectId={project.id}
            canEdit={canEdit}
          />
        )}

        {tab === "page" && doc && (
          <BlockEditor
            key={doc.id}
            pageId={doc.id}
            title={doc.title}
            initialBlocks={doc.blocks}
            version={doc.version}
            canEdit={canEdit}
            projectId={project.id}
            meId={user.id}
            sharing={{ published: doc.published, clientVisible: doc.clientVisible }}
            canShare={canShare}
          />
        )}

        {tab === "scratch" && (
          <Scratchpad projectId={project.id} items={scratch} canEdit={canEdit} meId={user.id} />
        )}

        {tab === "tasks" && (
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
                        <a href={`/hr/tasks/${t.id}`} style={{ fontWeight: 600, textDecoration: "none" }}>
                          {t.title}
                        </a>
                        <div className="small" style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 8 }}>
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
        )}
      </div>
    </>
  );
}

import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/access";
import { getTaskDetail } from "@/lib/reads/tasks";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DueChip, LinkChips, StatusBadge } from "@/components/ui/task-format";
import { StatusDropdown, CommentForm } from "@/components/TaskActions";
import { TaskChecklist } from "@/components/TaskChecklist";
import { TaskDependencies } from "@/components/TaskDependencies";

export const dynamic = "force-dynamic";

const PRIORITY_VARIANT: Record<string, "default" | "warning" | "danger"> = {
  Low: "default",
  Medium: "warning",
  High: "danger",
};

export default async function VaTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const task = await getTaskDetail(id);

  if (!task) {
    return (
      <div className="page-head">
        <div>
          <h1>Task not found</h1>
          <p className="small">This task may have been removed.</p>
        </div>
      </div>
    );
  }

  // A VA may view their own task in full, or read a task from the open/claimable
  // pool (so they can decide whether to claim it from Available). Managers, senior
  // VAs, and admins can view any task; everything else stays private.
  const isManager = ["HR_MANAGER", "PEOPLE_OPS", "TEAM_LEAD", "SENIOR_VA"].includes(user.role);
  const isOwn = task.assignedToId === user.id;
  if (!isManager && !user.isAdmin && !isOwn && !task.claimable) {
    return (
      <div className="page-head">
        <div>
          <h1>Not authorized</h1>
          <p className="small">This task isn’t assigned to you.</p>
        </div>
      </div>
    );
  }
  // Only the assignee (or a manager/admin) can change status or comment. A VA
  // previewing an unclaimed pool task sees it read-only.
  const canAct = isManager || user.isAdmin || isOwn;
  const poolPreview = !canAct && task.claimable;

  const sops = (task.relatedSops as { title: string; url: string }[] | null) ?? [];
  const trainings = (task.relatedTrainings as { title: string; url: string }[] | null) ?? [];
  const tools = (task.suggestedTools as { title: string; url: string; category?: string }[] | null) ?? [];

  const blocked = task.dependencies.some((d) => d.dependsOn.status !== "Done");

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            <Link href="/va/tasks">My Tasks</Link> / {task.title}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ margin: 0 }}>{task.title}</h1>
            {blocked && <Badge variant="danger" dot>Blocked</Badge>}
          </div>
        </div>
      </div>

      <div className="dash-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {poolPreview && (
            <Card padding={14} style={{ borderColor: "var(--color-sky-300)" }}>
              <p className="small" style={{ margin: 0 }}>
                This task is in the open pool. Claim it from{" "}
                <Link href="/hr/tasks/available">Available</Link> to work on it.
              </p>
            </Card>
          )}
          <Card padding={20}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <span style={{ width: 100, color: "var(--color-text-tertiary)", flexShrink: 0 }}>Status</span>
                {canAct ? (
                  <StatusDropdown taskId={task.id} current={task.status} />
                ) : (
                  <StatusBadge value={task.status} />
                )}
              </div>
              <Row label="Assigned by" value={task.assignedBy.name ?? "—"} />
              <Row label="Strategy" value={task.strategy} />
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <span style={{ width: 100, color: "var(--color-text-tertiary)", flexShrink: 0 }}>Priority</span>
                <Badge variant={PRIORITY_VARIANT[task.priority] ?? "default"} dot>
                  {task.priority}
                </Badge>
              </div>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <span style={{ width: 100, color: "var(--color-text-tertiary)", flexShrink: 0 }}>Due date</span>
                {task.dueDate ? <DueChip date={task.dueDate} status={task.status} /> : <span>—</span>}
              </div>
              {task.project && <Row label="Project" value={task.project.name} />}
              {task.client && <Row label="Client" value={task.client} />}
              {task.links && (
                <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <span style={{ width: 100, color: "var(--color-text-tertiary)", flexShrink: 0 }}>Links</span>
                  <LinkChips links={task.links} />
                </div>
              )}
            </div>
          </Card>

          {task.instructions && (
            <Card padding={20}>
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>Instructions</h3>
              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{task.instructions}</p>
            </Card>
          )}

          {(sops.length > 0 || trainings.length > 0 || tools.length > 0) && (
            <Card padding={20}>
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>Resources</h3>
              {sops.length > 0 && <ResourceList label="Related SOPs" items={sops} />}
              {trainings.length > 0 && <ResourceList label="Related Trainings" items={trainings} />}
              {tools.length > 0 && <ResourceList label="Suggested Tools" items={tools} />}
            </Card>
          )}

          <Card padding={20}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Checklist</h3>
            <TaskChecklist taskId={task.id} items={task.checklist} canManage={false} />
          </Card>

          <Card padding={20}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Blocked by</h3>
            <TaskDependencies
              taskId={task.id}
              dependencies={task.dependencies}
              candidateTasks={[]}
              canManage={false}
            />
          </Card>
        </div>

        {/* Comments */}
        <Card padding={0} style={{ overflow: "hidden" }}>
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--color-border)",
              background: "var(--color-bg-secondary)",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "var(--text-xl)" }}>Comments</h2>
          </div>
          <div>
            {task.comments.length === 0 ? (
              <p style={{ padding: 24, color: "var(--color-text-tertiary)", fontStyle: "italic" }}>
                No comments yet.
              </p>
            ) : (
              task.comments.map((c) => (
                <div
                  key={c.id}
                  style={{ padding: "12px 16px", borderBottom: "1px dashed var(--color-border-subtle)" }}
                >
                  <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>
                    {c.author.name ?? "Unknown"}
                    <span style={{ fontWeight: 400, color: "var(--color-text-tertiary)", marginLeft: 8 }}>
                      {c.createdAt.toLocaleDateString()}
                    </span>
                  </div>
                  <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{c.body}</p>
                </div>
              ))
            )}
            {canAct && <CommentForm taskId={task.id} />}
          </div>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 16 }}>
      <span style={{ width: 100, color: "var(--color-text-tertiary)", flexShrink: 0 }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function ResourceList({ label, items }: { label: string; items: { title: string; url: string }[] }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {items.map((item) => (
        <a
          key={item.url}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "block", color: "var(--color-sky-400)", marginBottom: 4 }}
        >
          {item.title}
        </a>
      ))}
    </div>
  );
}

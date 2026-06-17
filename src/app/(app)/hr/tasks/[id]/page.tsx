import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { canManageTasks } from "@/lib/auth/roles";
import { getTaskDetail } from "@/lib/reads/tasks";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusDropdown, CommentForm } from "@/components/TaskActions";
import { TaskEditForm } from "@/components/TaskEditForm";

export const dynamic = "force-dynamic";

export default async function HrTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user.isAdmin && !canManageTasks(user.role)) {
    redirect("/");
  }

  const task = await getTaskDetail(id);
  if (!task) return <p style={{ padding: 32 }}>Task not found.</p>;

  const sops = (task.relatedSops as { title: string; url: string }[] | null) ?? [];
  const trainings = (task.relatedTrainings as { title: string; url: string }[] | null) ?? [];
  const tools =
    (task.suggestedTools as { title: string; url: string; category?: string }[] | null) ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            <a href="/hr/tasks">All Tasks</a> / {task.title}
          </div>
          <h1>{task.title}</h1>
        </div>
        <div style={{ display: "flex", gap: 8, alignSelf: "center", alignItems: "center" }}>
          <StatusDropdown taskId={task.id} current={task.status} />
          <Badge variant={task.priority === "High" ? "danger" : "warning"}>{task.priority}</Badge>
        </div>
      </div>

      <div className="dash-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card padding={20}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Row label="Assigned to" value={task.assignedTo.name ?? task.assignedTo.email} />
              <Row label="Assigned by" value={task.assignedBy.name ?? "—"} />
              <Row label="Strategy" value={task.strategy} />
              <Row label="Status" value={task.status} />
              <Row label="Due date" value={task.dueDate?.toLocaleDateString() ?? "—"} />
              {task.client && <Row label="Client" value={task.client} />}
              {task.project && <Row label="Project" value={task.project.name} />}
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
              {tools.length > 0 && <ToolList label="Suggested Tools" items={tools} />}
            </Card>
          )}

          {(user.isAdmin || canManageTasks(user.role)) && (
            <Card padding={20}>
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>Edit task</h3>
              <TaskEditForm
                task={{
                  id: task.id,
                  title: task.title,
                  instructions: task.instructions,
                  strategy: task.strategy,
                  priority: task.priority,
                  status: task.status,
                  client: task.client,
                  dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : null,
                  links: task.links,
                }}
              />
            </Card>
          )}
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
          <div style={{ padding: 8 }}>
            {task.comments.length === 0 ? (
              <p style={{ padding: 24, color: "var(--color-text-tertiary)", fontStyle: "italic" }}>
                No comments yet.
              </p>
            ) : (
              task.comments.map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px dashed var(--color-border-subtle)",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>
                    {c.author.name ?? "Unknown"}
                    <span
                      style={{
                        fontWeight: 400,
                        color: "var(--color-text-tertiary)",
                        marginLeft: 8,
                      }}
                    >
                      {c.createdAt.toLocaleDateString()}
                    </span>
                  </div>
                  <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{c.body}</p>
                </div>
              ))
            )}
          </div>
          <div style={{ borderTop: "1px solid var(--color-border)" }}>
            <CommentForm taskId={task.id} />
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

function ToolList({
  label,
  items,
}: {
  label: string;
  items: { title: string; url: string; category?: string }[];
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {items.map((item) => (
          <a
            key={item.url}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: "var(--radius-input)",
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-sky-400)",
              textDecoration: "none",
              fontSize: "var(--text-sm)",
            }}
          >
            {item.title}
            {item.category && (
              <span className="small" style={{ color: "var(--color-text-tertiary)" }}>
                {item.category}
              </span>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}

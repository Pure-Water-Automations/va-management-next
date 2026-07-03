import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getEffectiveActor } from "@/lib/auth/access";
import { canManageTasks } from "@/lib/auth/roles";
import { getTaskDetail, getAllTasks } from "@/lib/reads/tasks";
import { getDelegationAssignees } from "@/lib/reads/assignees";
import { getClients } from "@/lib/reads/clients";
import { Card } from "@/components/ui/Card";
import { CommentForm } from "@/components/TaskActions";
import { TaskInlineDetail } from "@/components/TaskInlineDetail";
import { TaskChecklist } from "@/components/TaskChecklist";
import { TaskDependencies } from "@/components/TaskDependencies";

export const dynamic = "force-dynamic";

export default async function HrTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const actor = await getEffectiveActor(user);
  if (!actor.isAdmin && !canManageTasks(actor.role)) {
    // VAs/clients don't have the manager task view. Several VA-reachable surfaces
    // still link here (the Available pool, ⌘K search, "Blocked by" dependencies),
    // so route them to their own detail view instead of bouncing to the dashboard —
    // otherwise the click looks broken ("can't open the task").
    redirect(`/va/tasks/${id}`);
  }

  const task = await getTaskDetail(id);
  if (!task) return <p style={{ padding: 32 }}>Task not found.</p>;

  const sops = (task.relatedSops as { title: string; url: string }[] | null) ?? [];
  const trainings = (task.relatedTrainings as { title: string; url: string }[] | null) ?? [];
  const tools =
    (task.suggestedTools as { title: string; url: string; category?: string }[] | null) ?? [];

  const candidateTasks = (await getAllTasks({}))
    .filter((t) => t.id !== task.id)
    .map((t) => ({ id: t.id, title: t.title }));

  const clients = await getClients();
  const assignees = await getDelegationAssignees();

  const blocked = task.dependencies.some((d) => d.dependsOn.status !== "Done");

  return (
    <>
      <div className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <div className="crumb">
            {task.project ? (
              <Link href={`/hr/projects/${task.project.id}`}>{task.project.name}</Link>
            ) : (
              <Link href="/hr/tasks">All Tasks</Link>
            )}{" "}
            / {task.title}
          </div>
        </div>
      </div>

      <div className="dash-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* One inline-editable view of the task — click any field to edit it. */}
          <TaskInlineDetail
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
              assignedToId: task.assignedToId,
              assignedToName: task.assignedTo.name ?? task.assignedTo.email,
              assignedByName: task.assignedBy.name ?? "—",
              projectId: task.project?.id ?? null,
              projectName: task.project?.name ?? null,
              claimable: task.claimable,
            }}
            clients={clients}
            assignees={assignees}
            blocked={blocked}
          />

          {(sops.length > 0 || trainings.length > 0 || tools.length > 0) && (
            <Card padding={20}>
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>Resources</h3>
              {sops.length > 0 && <ResourceList label="Related SOPs" items={sops} />}
              {trainings.length > 0 && <ResourceList label="Related Trainings" items={trainings} />}
              {tools.length > 0 && <ToolList label="Suggested Tools" items={tools} />}
            </Card>
          )}

          <Card padding={20}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Checklist</h3>
            <TaskChecklist taskId={task.id} items={task.checklist} canManage />
          </Card>

          <Card padding={20}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Blocked by</h3>
            <TaskDependencies
              taskId={task.id}
              dependencies={task.dependencies}
              candidateTasks={candidateTasks}
              canManage
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

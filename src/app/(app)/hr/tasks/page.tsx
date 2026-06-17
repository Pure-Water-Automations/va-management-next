import { getCurrentUser } from "@/lib/auth/access";
import { canManageTasks } from "@/lib/auth/roles";
import { getAllTasks } from "@/lib/reads/tasks";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function HrTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; client?: string; va?: string }>;
}) {
  const { status, client, va } = await searchParams;
  const user = await getCurrentUser();
  if (!canManageTasks(user.role)) {
    return <p style={{ padding: 32 }}>Not authorized.</p>;
  }

  const tasks = await getAllTasks({
    ...(status ? { status } : {}),
    ...(client ? { client } : {}),
    ...(va ? { assignedToId: va } : {}),
  });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Projects</div>
          <h1>All Tasks</h1>
        </div>
        <a href="/hr/tasks/new" className="btn btn-primary" style={{ alignSelf: "center" }}>
          + Delegate Task
        </a>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["NotStarted", "InProgress", "Blocked", "Done"] as const).map((s) => (
          <a
            key={s}
            href={status === s ? "/hr/tasks" : `/hr/tasks?status=${s}`}
            style={{
              padding: "4px 10px",
              borderRadius: 4,
              border: "1px solid var(--color-border)",
              fontSize: "var(--text-sm)",
              textDecoration: "none",
              background: status === s ? "var(--color-sky-500)" : undefined,
              color: status === s ? "#fff" : undefined,
            }}
          >
            {s}
          </a>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {tasks.length === 0 ? (
          <p style={{ color: "var(--color-text-tertiary)", fontStyle: "italic" }}>No tasks found.</p>
        ) : (
          tasks.map((t) => (
            <Card key={t.id} padding={16}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <a href={`/hr/tasks/${t.id}`} style={{ fontWeight: 600, textDecoration: "none" }}>
                    {t.title}
                  </a>
                  <div className="small" style={{ marginTop: 2, color: "var(--color-text-secondary)" }}>
                    {t.assignedTo.name ?? t.assignedTo.email}
                    {t.project ? ` · ${t.project.name}` : ""}
                    {t.client ? ` · ${t.client}` : ""}
                    {" · "}
                    {t.dueDate ? `Due ${t.dueDate.toLocaleDateString()}` : "No due date"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Badge variant="default">{t.strategy}</Badge>
                  <Badge
                    variant={
                      t.status === "Done" ? "info" : t.status === "Blocked" ? "danger" : "default"
                    }
                  >
                    {t.status}
                  </Badge>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </>
  );
}

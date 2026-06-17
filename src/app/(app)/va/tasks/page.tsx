import { getCurrentUser } from "@/lib/auth/access";
import { getMyTasks } from "@/lib/reads/tasks";
import { Stat } from "@/components/ui/Stat";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function VaTasksPage() {
  const user = await getCurrentUser();
  const tasks = await getMyTasks(user.id);

  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const overdue = tasks.filter(
    (t) => t.status !== "Done" && t.dueDate && t.dueDate < now,
  );
  const thisWeek = tasks.filter(
    (t) => t.status !== "Done" && t.dueDate && t.dueDate >= now && t.dueDate <= sevenDays,
  );
  const open = tasks.filter((t) => t.status !== "Done");

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">My Console</div>
          <h1>My Tasks</h1>
        </div>
      </div>

      <div className="stat-grid">
        <Stat label="My open tasks" value={open.length} />
        <Stat label="Overdue" value={overdue.length} trend={overdue.length ? "down" : "neutral"} />
        <Stat label="Due this week" value={thisWeek.length} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 24 }}>
        {overdue.length > 0 && (
          <Section title="🔴 Overdue" tasks={overdue} />
        )}
        {thisWeek.length > 0 && (
          <Section title="📅 Due This Week" tasks={thisWeek} />
        )}
        {tasks.filter(
          (t) =>
            t.status !== "Done" &&
            (!t.dueDate || t.dueDate > sevenDays),
        ).length > 0 && (
          <Section
            title="Later"
            tasks={tasks.filter(
              (t) => t.status !== "Done" && (!t.dueDate || t.dueDate > sevenDays),
            )}
          />
        )}
        {tasks.filter((t) => t.status === "Done").length > 0 && (
          <Section
            title="Done"
            tasks={tasks.filter((t) => t.status === "Done")}
          />
        )}
        {tasks.length === 0 && (
          <p style={{ color: "var(--color-text-tertiary)", fontStyle: "italic" }}>
            No tasks assigned yet.
          </p>
        )}
      </div>
    </>
  );
}

type TaskItem = Awaited<ReturnType<typeof getMyTasks>>[number];

function Section({ title, tasks }: { title: string; tasks: TaskItem[] }) {
  return (
    <div>
      <h2 style={{ marginBottom: 12 }}>{title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {tasks.map((t) => (
          <Card key={t.id} padding={16}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <a href={`/va/tasks/${t.id}`} style={{ fontWeight: 600, textDecoration: "none" }}>
                  {t.title}
                </a>
                <div className="small" style={{ marginTop: 2, color: "var(--color-text-secondary)" }}>
                  {t.project ? `${t.project.name} · ` : ""}
                  {t.assignedBy.name ? `From ${t.assignedBy.name} · ` : ""}
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
        ))}
      </div>
    </div>
  );
}

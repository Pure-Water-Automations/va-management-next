import { getCurrentUser, getEffectiveVaId } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { getMyTasks } from "@/lib/reads/tasks";
import { Stat } from "@/components/ui/Stat";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusDropdown } from "@/components/TaskActions";
import {
  PriorityBadge,
  DueChip,
  AssigneeChip,
  EmptyState,
} from "@/components/ui/task-format";

export const dynamic = "force-dynamic";

export default async function VaTasksPage() {
  const user = await getCurrentUser();
  // Honor admin "view as VA" impersonation like every other VA page, so a manager
  // testing the VA console sees the impersonated VA's tasks, not their own.
  let subjectUserId = user.id;
  if (!user.vaId) {
    const vaId = await getEffectiveVaId(user);
    if (vaId) {
      const linked = await db.user.findFirst({ where: { vaId, active: true }, select: { id: true } });
      if (linked) subjectUserId = linked.id;
    }
  }
  const tasks = await getMyTasks(subjectUserId);

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
          <EmptyState
            icon="✅"
            title="No tasks assigned to you"
            hint="You're all caught up."
          />
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
          <Card key={t.id} padding={16} style={{ position: "relative", cursor: "pointer" }}>
            <a
              href={`/va/tasks/${t.id}`}
              aria-label={`Open ${t.title}`}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 1,
                borderRadius: "inherit",
              }}
            />
            <div
              style={{
                position: "relative",
                zIndex: 2,
                pointerEvents: "none",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{t.title}</div>
                <div
                  className="small"
                  style={{
                    marginTop: 6,
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 10,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {t.project && <span>{t.project.name}</span>}
                  {t.assignedBy.name && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      From <AssigneeChip name={t.assignedBy.name} />
                    </span>
                  )}
                  <DueChip date={t.dueDate} status={t.status} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                <Badge variant="default">{t.strategy}</Badge>
                <PriorityBadge value={t.priority} />
                <span style={{ pointerEvents: "auto" }}>
                  <StatusDropdown taskId={t.id} current={t.status} />
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/access";
import { getAvailableTasks } from "@/lib/reads/tasks";
import { Card } from "@/components/ui/Card";
import { PriorityBadge, DueChip } from "@/components/ui/task-format";
import { PoolTaskActions } from "@/components/PoolTaskActions";

export const dynamic = "force-dynamic";

export default async function AvailableTasksPage() {
  const user = await getCurrentUser(); // any signed-in user can view/claim from the pool
  const isManager = user.caps.manageTasks;
  const tasks = await getAvailableTasks();

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb"><Link href="/hr/tasks">All Tasks</Link> / Available</div>
          <h1>Available tasks</h1>
        </div>
      </div>
      <p className="small" style={{ color: "var(--color-text-secondary)", marginTop: -8, marginBottom: 20 }}>
        Open tasks anyone can pick up — claim one and a manager confirms it&apos;s yours. Good for non-urgent / internal work.
      </p>

      {tasks.length === 0 ? (
        <p style={{ color: "var(--color-text-tertiary)", fontStyle: "italic" }}>No open tasks right now.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tasks.map((t) => (
            <Card key={t.id} padding={16}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <a href={`/hr/tasks/${t.id}`} style={{ fontWeight: 600, textDecoration: "none" }}>
                    {t.title}
                  </a>
                  <div className="small" style={{ marginTop: 3, display: "flex", gap: 8, alignItems: "center", color: "var(--color-text-tertiary)" }}>
                    <PriorityBadge value={t.priority} />
                    {t.project && <span>· {t.project.name}</span>}
                    {t.client && <span>· {t.client}</span>}
                    {t.dueDate && <DueChip date={t.dueDate} status="NotStarted" />}
                    <span>· posted by {t.assignedBy.name ?? "—"}</span>
                  </div>
                </div>
                <PoolTaskActions
                  taskId={t.id}
                  pending={t.claimRequestedBy ? { name: t.claimRequestedBy.name ?? t.claimRequestedBy.email } : null}
                  isManager={isManager}
                />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { canManageTasks } from "@/lib/auth/roles";
import { getAllTasks } from "@/lib/reads/tasks";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Avatar, StatusBadge } from "@/components/ui/task-format";

export const dynamic = "force-dynamic";

type VaRow = {
  id: string;
  name: string | null;
  email: string;
  open: number;
  overdue: number;
  inProgress: number;
  done: number;
  total: number;
};

export default async function HrWorkloadPage() {
  const user = await getCurrentUser();
  if (!user.isAdmin && !canManageTasks(user.role)) {
    redirect("/hr/tasks");
  }

  const [vas, tasks] = await Promise.all([
    db.user.findMany({
      where: { role: { in: ["VA", "SENIOR_VA"] }, active: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    getAllTasks({}),
  ]);

  const now = new Date();

  // Match tasks to VAs by the scalar assignedToId (most reliable key).
  const rows: VaRow[] = vas.map((va) => {
    const mine = tasks.filter((t) => t.assignedToId === va.id);
    let open = 0;
    let overdue = 0;
    let inProgress = 0;
    let done = 0;
    for (const t of mine) {
      const isDone = t.status === "Done";
      if (isDone) done++;
      else {
        open++;
        if (t.status === "InProgress") inProgress++;
        if (t.dueDate && new Date(t.dueDate).getTime() < now.getTime()) overdue++;
      }
    }
    return {
      id: va.id,
      name: va.name,
      email: va.email,
      open,
      overdue,
      inProgress,
      done,
      total: mine.length,
    };
  });

  // Sort by open-count desc (then overdue, then name) so the busiest are on top.
  rows.sort(
    (a, b) =>
      b.open - a.open ||
      b.overdue - a.overdue ||
      (a.name ?? a.email).localeCompare(b.name ?? b.email),
  );

  const maxOpen = Math.max(1, ...rows.map((r) => r.open));
  const teamOpen = rows.reduce((s, r) => s + r.open, 0);
  const teamOverdue = rows.reduce((s, r) => s + r.overdue, 0);
  const vasWithWork = rows.filter((r) => r.open > 0).length;

  // A VA is "overloaded" if they carry an above-average share of open work.
  const avgOpen = teamOpen / Math.max(1, rows.length);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">HR Operations</div>
          <h1>Workload</h1>
        </div>
      </div>

      <div className="stat-grid">
        <Stat
          label="Open tasks (team)"
          value={teamOpen}
          variant={teamOpen ? "navy" : "default"}
        />
        <Stat
          label="Overdue (team)"
          value={teamOverdue}
          trend={teamOverdue ? "down" : "neutral"}
          change={teamOverdue ? String(teamOverdue) : undefined}
          changeLabel={teamOverdue ? "need attention" : undefined}
        />
        <Stat label="VAs with open work" value={`${vasWithWork} / ${rows.length}`} />
      </div>

      <Card style={{ marginTop: "var(--space-6)" }} padding={0}>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "12px 16px" }}>VA</th>
                <th style={{ textAlign: "left", padding: "12px 16px", minWidth: 200 }}>Load</th>
                <th style={{ textAlign: "right", padding: "12px 16px" }}>Open</th>
                <th style={{ textAlign: "right", padding: "12px 16px" }}>In progress</th>
                <th style={{ textAlign: "right", padding: "12px 16px" }}>Overdue</th>
                <th style={{ textAlign: "right", padding: "12px 16px" }}>Done</th>
                <th style={{ textAlign: "right", padding: "12px 16px" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const display = r.name?.trim() || r.email;
                const pct = Math.round((r.open / maxOpen) * 100);
                const overloaded = r.overdue > 0 || r.open > avgOpen * 1.5;
                const barColor = overloaded
                  ? "var(--color-error)"
                  : r.open > avgOpen
                    ? "var(--color-warning)"
                    : "var(--color-sky-500)";
                return (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <a
                        href={`/hr/tasks?va=${r.id}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          textDecoration: "none",
                          color: "var(--color-text-primary)",
                          fontWeight: 600,
                        }}
                      >
                        <Avatar name={r.name} email={r.email} size={26} />
                        {display}
                      </a>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            position: "relative",
                            flex: 1,
                            height: 8,
                            borderRadius: 999,
                            background: "var(--color-neutral-100)",
                            overflow: "hidden",
                            minWidth: 80,
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              width: `${pct}%`,
                              background: barColor,
                              borderRadius: 999,
                            }}
                          />
                        </div>
                        {r.open === 0 ? (
                          <StatusBadge value="Done" />
                        ) : (
                          <span className="small" style={{ color: "var(--color-text-secondary)" }}>
                            {r.open} open
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600 }}>
                      {r.open}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>{r.inProgress}</td>
                    <td
                      style={{
                        padding: "12px 16px",
                        textAlign: "right",
                        fontWeight: r.overdue > 0 ? 700 : 400,
                        color: r.overdue > 0 ? "var(--color-error-dark)" : undefined,
                      }}
                    >
                      {r.overdue}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "var(--color-text-tertiary)" }}>
                      {r.done}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>{r.total}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: "24px 16px", textAlign: "center", color: "var(--color-text-tertiary)" }}>
                    No active VAs.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

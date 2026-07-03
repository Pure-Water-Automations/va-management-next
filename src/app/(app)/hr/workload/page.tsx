import { redirect } from "next/navigation";
import { getCurrentUser, getEffectiveActor } from "@/lib/auth/access";
import { canManageTasks } from "@/lib/auth/roles";
import { getAllTasks } from "@/lib/reads/tasks";
import { db } from "@/lib/db";
import { computeUtilization } from "@/lib/services/capacity";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Avatar } from "@/components/ui/task-format";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;
const clamp = (x: number) => Math.min(100, Math.max(6, x));

type VaRow = {
  id: string;
  name: string | null;
  email: string;
  open: number;
  overdue: number;
  inProgress: number;
  done: number;
  total: number;
  hasTarget: boolean;
  last14dHours: number;
  expected14d: number;
  utilizationPct: number;
};

export default async function HrWorkloadPage() {
  const user = await getCurrentUser();
  const actor = await getEffectiveActor(user);
  if (!actor.isAdmin && !canManageTasks(actor.role)) {
    redirect("/hr/tasks");
  }

  const [vas, tasks, vaRecords, hours] = await Promise.all([
    db.user.findMany({
      where: { role: { in: ["VA", "SENIOR_VA"] }, active: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    getAllTasks({}),
    db.va.findMany({
      where: { status: { in: ["active", "training"] } },
      select: { vaId: true, email: true, targetHoursWeekly: true, daysOff: true },
    }),
    db.deskLogHours.groupBy({
      by: ["vaId"],
      where: { date: { gte: new Date(Date.now() - 14 * DAY) } },
      _sum: { taskSpentHrs: true },
    }),
  ]);

  const now = new Date();

  // Capacity is keyed by the Va row, matched to each workload User by email
  // (User.email === Va.email; User.vaId is unreliable). Sum the last 14d of
  // logged task-hours per VA.
  const hoursByVaId = new Map(hours.map((h) => [h.vaId, h._sum.taskSpentHrs ?? 0]));
  const capByEmail = new Map(
    vaRecords.map((va) => {
      const last14dHours = hoursByVaId.get(va.vaId) ?? 0;
      const target = va.targetHoursWeekly ?? 0;
      const { expected14d, utilizationPct } = computeUtilization(target, last14dHours);
      return [va.email.toLowerCase(), { hasTarget: target > 0, last14dHours, expected14d, utilizationPct }];
    }),
  );

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
    const cap = capByEmail.get(va.email.toLowerCase()) ?? { hasTarget: false, last14dHours: 0, expected14d: 0, utilizationPct: 0 };
    return {
      id: va.id,
      name: va.name,
      email: va.email,
      open,
      overdue,
      inProgress,
      done,
      total: mine.length,
      ...cap,
    };
  });

  // Sort by overdue desc, then utilization desc, then name.
  rows.sort(
    (a, b) =>
      b.overdue - a.overdue ||
      b.utilizationPct - a.utilizationPct ||
      (a.name ?? a.email).localeCompare(b.name ?? b.email),
  );

  const teamOpen = rows.reduce((s, r) => s + r.open, 0);
  const teamOverdue = rows.reduce((s, r) => s + r.overdue, 0);
  const vasWithWork = rows.filter((r) => r.open > 0).length;

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
                // Load = capacity utilization, NOT raw open count. A busy VA WITH
                // capacity stays calm/healthy; red is reserved for genuine
                // needs-attention (overdue work, or logging well over target).
                const util = Math.round(r.utilizationPct);
                const barColor =
                  r.overdue > 0
                    ? "var(--color-error)"
                    : r.hasTarget && r.utilizationPct > 120
                      ? "var(--color-error)"
                      : r.hasTarget && r.utilizationPct >= 70
                        ? "var(--color-success)"
                        : "var(--color-sky-400)";
                const pct = r.hasTarget
                  ? clamp(util)
                  : r.last14dHours > 0
                    ? clamp(Math.round((r.last14dHours / 40) * 100))
                    : 6;
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
                          <span className="small" style={{ color: "var(--color-text-tertiary)", fontStyle: "italic" }}>Clear</span>
                        ) : r.hasTarget ? (
                          <span
                            className="small"
                            style={{ color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}
                            title="logged vs target, 14d"
                          >
                            {util}% · {Math.round(r.last14dHours)}/{Math.round(r.expected14d)}h
                          </span>
                        ) : (
                          <span className="small" style={{ color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                            {Math.round(r.last14dHours)}h · no target
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

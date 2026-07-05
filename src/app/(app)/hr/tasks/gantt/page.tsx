import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { getAllTasks } from "@/lib/reads/tasks";
import { Card } from "@/components/ui/Card";
import { Avatar, EmptyState } from "@/components/ui/task-format";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;
const MAX_SPAN_DAYS = 120;

// Status → bar color (Done=green, InProgress=sky, Blocked=red, NotStarted/other=navy/grey).
function barColor(status: string): string {
  switch (status) {
    case "Done":
      return "var(--color-success, #2fa37a)";
    case "InProgress":
      return "var(--color-sky-500, #38bdf8)";
    case "Blocked":
      return "var(--color-error-dark, #b5495b)";
    case "NotStarted":
    default:
      return "var(--color-navy-800, #1e2a44)";
  }
}

function startOfDay(d: Date): Date {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}

function fmt(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function HrTasksGanttPage() {
  const user = await getCurrentUser();
  if (!user.caps.manageTasks) {
    redirect("/hr/tasks");
  }

  const allTasks = await getAllTasks({});
  // A timeline needs an end — keep only tasks that have a due date.
  const dated = allTasks
    .filter((t) => t.dueDate != null)
    .sort((a, b) => (a.dueDate as Date).getTime() - (b.dueDate as Date).getTime());

  const PageHead = (
    <div className="page-head" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Timeline</h1>
        <a
          href="/hr/tasks"
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--color-sky-700)",
            textDecoration: "none",
          }}
        >
          ← Back to tasks
        </a>
      </div>
      <p className="small" style={{ color: "var(--color-text-secondary)", marginTop: 4 }}>
        Tasks with a due date, sorted by deadline.
      </p>
    </div>
  );

  if (dated.length === 0) {
    return (
      <div>
        {PageHead}
        <EmptyState
          icon="📅"
          title="No scheduled tasks"
          hint="Tasks need a due date to appear on the timeline."
          ctaHref="/hr/tasks"
          ctaLabel="Go to tasks"
        />
      </div>
    );
  }

  // ── Window: from min(createdAt, today) to max(dueDate), clamped ──────────────
  const today = startOfDay(new Date());
  let windowStart = new Date(today.getTime() - 7 * DAY); // today − 7d floor
  for (const t of dated) {
    const created = startOfDay(t.createdAt);
    if (created.getTime() < windowStart.getTime()) windowStart = created;
  }

  let windowEnd = startOfDay(dated[dated.length - 1].dueDate as Date);
  if (windowEnd.getTime() < today.getTime()) windowEnd = today;
  // Cap total span to ~MAX_SPAN_DAYS.
  const maxEnd = windowStart.getTime() + MAX_SPAN_DAYS * DAY;
  if (windowEnd.getTime() > maxEnd) windowEnd = new Date(maxEnd);

  const startMs = windowStart.getTime();
  const totalMs = Math.max(windowEnd.getTime() - startMs, DAY); // avoid /0

  const pct = (ms: number) => {
    const clamped = Math.min(Math.max(ms, startMs), startMs + totalMs);
    return ((clamped - startMs) / totalMs) * 100;
  };

  const todayPct = pct(today.getTime());

  // ── Month tick labels along the top of the track ─────────────────────────────
  const ticks: { left: number; label: string }[] = [];
  {
    const cursor = new Date(windowStart.getFullYear(), windowStart.getMonth(), 1);
    // advance to first month boundary >= windowStart
    if (cursor.getTime() < startMs) cursor.setMonth(cursor.getMonth() + 1);
    while (cursor.getTime() <= startMs + totalMs) {
      ticks.push({
        left: pct(cursor.getTime()),
        label: cursor.toLocaleDateString(undefined, { month: "short" }),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  const LABEL_COL = 240;
  const TRACK_MIN = 640;

  return (
    <div>
      {PageHead}
      <Card>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: LABEL_COL + TRACK_MIN }}>
            {/* Header row: window dates + month ticks over the track */}
            <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 8 }}>
              <div style={{ width: LABEL_COL, flexShrink: 0 }} />
              <div style={{ position: "relative", flex: 1, height: 22 }}>
                <span
                  className="small"
                  style={{ position: "absolute", left: 0, color: "var(--color-text-tertiary)" }}
                >
                  {fmt(windowStart)}
                </span>
                <span
                  className="small"
                  style={{ position: "absolute", right: 0, color: "var(--color-text-tertiary)" }}
                >
                  {fmt(windowEnd)}
                </span>
                {ticks.map((tk, i) => (
                  <span
                    key={i}
                    className="small"
                    style={{
                      position: "absolute",
                      left: `${tk.left}%`,
                      transform: "translateX(-50%)",
                      color: "var(--color-text-tertiary)",
                    }}
                  >
                    {tk.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Task rows */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {dated.map((t) => {
                const start = startOfDay(t.createdAt);
                const due = startOfDay(t.dueDate as Date);
                const leftPct = pct(start.getTime());
                const rightPct = pct(due.getTime());
                const widthPct = Math.max(rightPct - leftPct, 1.2); // keep visible
                const color = barColor(t.status);

                return (
                  <div key={t.id} style={{ display: "flex", alignItems: "center" }}>
                    {/* Label column */}
                    <div
                      style={{
                        width: LABEL_COL,
                        flexShrink: 0,
                        paddingRight: 12,
                        overflow: "hidden",
                      }}
                    >
                      <a
                        href={`/hr/tasks/${t.id}`}
                        title={t.title}
                        style={{
                          display: "block",
                          fontSize: "var(--text-sm)",
                          fontWeight: 600,
                          color: "var(--color-text-primary)",
                          textDecoration: "none",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {t.title}
                      </a>
                      <div
                        className="small"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          color: "var(--color-text-tertiary)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        <Avatar name={t.assignedTo?.name} email={t.assignedTo?.email} size={16} />
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {t.assignedTo?.name ?? "Unassigned"}
                          {t.project?.name ? ` · ${t.project.name}` : ""}
                        </span>
                      </div>
                    </div>

                    {/* Track */}
                    <div
                      style={{
                        position: "relative",
                        flex: 1,
                        height: 30,
                        background: "var(--color-bg-secondary)",
                        borderRadius: 6,
                        border: "1px solid var(--color-border)",
                      }}
                    >
                      {/* today marker */}
                      {todayPct >= 0 && todayPct <= 100 && (
                        <div
                          aria-hidden
                          style={{
                            position: "absolute",
                            top: 0,
                            bottom: 0,
                            left: `${todayPct}%`,
                            width: 1,
                            background: "var(--color-text-tertiary)",
                            opacity: 0.45,
                          }}
                        />
                      )}
                      {/* bar */}
                      <div
                        title={`${t.title} — due ${due.toLocaleDateString()}`}
                        style={{
                          position: "absolute",
                          top: 5,
                          bottom: 5,
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          minWidth: 6,
                          background: color,
                          borderRadius: 5,
                          display: "flex",
                          alignItems: "center",
                          paddingInline: 6,
                          color: "#fff",
                          fontSize: "var(--text-xs)",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                        }}
                      >
                        {fmt(due)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { canManageTasks } from "@/lib/auth/roles";
import { getAllTasks } from "@/lib/reads/tasks";
import { TaskViewTabs } from "@/components/TaskViewTabs";

export const dynamic = "force-dynamic";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Map task status → a chip background color. */
function statusColor(status: string): string {
  switch (status) {
    case "Done":
      return "var(--color-success-dark, #2fa37a)";
    case "InProgress":
      return "var(--color-sky-500, #38bdf8)";
    case "Blocked":
      return "var(--color-error-dark, #b5495b)";
    case "NotStarted":
    default:
      return "var(--color-navy-800, #1f2a44)";
  }
}

/** Local YYYY-MM-DD key for a date (no UTC shift). */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM" for a given year/month (month is 0-indexed). */
function monthParam(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}`;
}

export default async function TaskCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthRaw } = await searchParams;
  const user = await getCurrentUser();
  if (!canManageTasks(user.role) && !user.isAdmin) {
    redirect("/hr/tasks");
  }

  // ── Resolve the month being viewed ──────────────────────────────────────────
  const now = new Date();
  let year = now.getFullYear();
  let month0 = now.getMonth();
  if (monthRaw && /^\d{4}-\d{2}$/.test(monthRaw)) {
    const [y, m] = monthRaw.split("-").map(Number);
    if (m >= 1 && m <= 12) {
      year = y;
      month0 = m - 1;
    }
  }

  // Prev / next month strings.
  const prevDate = new Date(year, month0 - 1, 1);
  const nextDate = new Date(year, month0 + 1, 1);
  const prevParam = monthParam(prevDate.getFullYear(), prevDate.getMonth());
  const nextParam = monthParam(nextDate.getFullYear(), nextDate.getMonth());

  // ── Build a stable 6×7 grid starting from the Sunday on/before the 1st ───────
  const first = new Date(year, month0, 1);
  const gridStart = new Date(year, month0, 1 - first.getDay());
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }
  const visibleKeys = new Set(days.map(dayKey));
  const todayKey = dayKey(now);

  // ── Load + bucket tasks by due-date day key (only those visible in the grid) ─
  const tasks = await getAllTasks({});
  const byDay = new Map<string, typeof tasks>();
  for (const t of tasks) {
    if (!t.dueDate) continue;
    const key = dayKey(t.dueDate);
    if (!visibleKeys.has(key)) continue;
    const bucket = byDay.get(key);
    if (bucket) bucket.push(t);
    else byDay.set(key, [t]);
  }

  const navLink = (href: string, label: string) => (
    <a
      href={href}
      className="btn"
      style={{ fontSize: "var(--text-sm)", padding: "4px 12px", textDecoration: "none" }}
    >
      {label}
    </a>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Projects</div>
          <h1>
            Task Calendar — {MONTH_NAMES[month0]} {year}
          </h1>
        </div>
      </div>

      <TaskViewTabs current="calendar" />

      {/* Month navigation */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        {navLink(`/hr/tasks/calendar?month=${prevParam}`, "‹ Prev")}
        {navLink("/hr/tasks/calendar", "Today")}
        {navLink(`/hr/tasks/calendar?month=${nextParam}`, "Next ›")}
      </div>

      {/* Weekday headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(110px, 1fr))",
          gap: 1,
          overflowX: "auto",
        }}
      >
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            style={{
              padding: "6px 8px",
              fontSize: "var(--text-xs)",
              fontWeight: 700,
              textTransform: "uppercase",
              color: "var(--color-text-tertiary)",
              textAlign: "center",
            }}
          >
            {w}
          </div>
        ))}

        {/* Day cells */}
        {days.map((d) => {
          const key = dayKey(d);
          const inMonth = d.getMonth() === month0;
          const isToday = key === todayKey;
          const dayTasks = byDay.get(key) ?? [];
          const shown = dayTasks.slice(0, 3);
          const extra = dayTasks.length - shown.length;

          return (
            <div
              key={key}
              style={{
                minHeight: 96,
                padding: 6,
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                background: inMonth
                  ? "var(--color-bg, #fff)"
                  : "var(--color-bg-secondary, #f5f5f7)",
                opacity: inMonth ? 1 : 0.6,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                outline: isToday ? "2px solid var(--color-sky-500, #38bdf8)" : "none",
                outlineOffset: -1,
              }}
            >
              <div
                style={{
                  fontSize: "var(--text-xs)",
                  fontWeight: isToday ? 800 : 600,
                  color: isToday
                    ? "var(--color-sky-700, #0369a1)"
                    : inMonth
                      ? "var(--color-text-secondary)"
                      : "var(--color-text-tertiary)",
                  textAlign: "right",
                }}
              >
                {d.getDate()}
              </div>

              {shown.map((t) => (
                <a
                  key={t.id}
                  href={`/hr/tasks/${t.id}`}
                  title={t.title ?? ""}
                  style={{
                    display: "block",
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: statusColor(t.status),
                    color: "#fff",
                    fontSize: "var(--text-xs)",
                    fontWeight: 600,
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {t.title ?? "(untitled)"}
                </a>
              ))}

              {extra > 0 && (
                <div
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-tertiary)",
                    fontWeight: 600,
                  }}
                >
                  +{extra} more
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

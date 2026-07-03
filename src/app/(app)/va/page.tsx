import { getCurrentUser, getEffectiveVaId } from "@/lib/auth/access";
import { humanRole } from "@/lib/labels";
import { db } from "@/lib/db";
import { getVaDashboard } from "@/lib/reads/va";
import { getMyTasks } from "@/lib/reads/tasks";
import { Stat } from "@/components/ui/Stat";
import { VaQuickActions } from "@/components/VaQuickActions";
import { StatusDropdown } from "@/components/TaskActions";
import { PriorityBadge, DueChip, AssigneeChip } from "@/components/ui/task-format";
import { IconTrendingUp, IconCalendarCheck, IconChevronRight, IconArrowRight, IconSparkles } from "@/components/icons";

export const dynamic = "force-dynamic";

function isToday(d: Date): boolean {
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export default async function VaConsole() {
  const user = await getCurrentUser();
  const vaId = await getEffectiveVaId(user);
  if (!vaId) {
    return (
      <div className="page-head">
        <div>
          <h1>VA console</h1>
          <p className="small">Your login isn’t linked to a VA record yet. Ask HR to connect it.</p>
        </div>
      </div>
    );
  }

  // Resolve the subject user for task queries (honors admin "view as VA").
  let subjectUserId = user.id;
  if (!user.vaId) {
    const linked = await db.user.findFirst({ where: { vaId, active: true }, select: { id: true } });
    if (linked) subjectUserId = linked.id;
  }

  const [d, tasks] = await Promise.all([getVaDashboard(vaId), getMyTasks(subjectUserId)]);

  const now = new Date();
  const open = tasks.filter((t) => t.status !== "Done");
  const overdue = open.filter((t) => t.dueDate && t.dueDate < now && !isToday(t.dueDate));
  const dueToday = open.filter((t) => t.dueDate && isToday(t.dueDate));
  const plate = [...dueToday, ...overdue, ...open.filter((t) => !dueToday.includes(t) && !overdue.includes(t))].slice(0, 4);

  const targetWeek = d.va.targetHoursWeekly ?? 0;
  const hoursPct = targetWeek > 0 ? Math.min(100, Math.round((d.last7 / targetWeek) * 100)) : 0;

  const threshold = d.role?.minTotalHoursToReachNext ?? null;
  const tierPct = threshold ? Math.min(100, Math.round((d.cumulative / threshold) * 100)) : 100;

  const heroTitle = overdue.length
    ? "A few things slipped past due"
    : dueToday.length
      ? "Let’s clear today’s plate"
      : "You’re all caught up";
  const heroSub = overdue.length
    ? `You have ${overdue.length} overdue and ${dueToday.length} due today. Knock out the oldest first.`
    : dueToday.length
      ? `${dueToday.length} ${dueToday.length === 1 ? "task is" : "tasks are"} due today. You’ve got this.`
      : "No overdue work and nothing due today. Great place to be.";

  return (
    <div className="dash-stage">
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)", fontWeight: 600 }}>
          {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </div>
        <h1 style={{ margin: "4px 0 0", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-4xl)", letterSpacing: "-.03em", color: "var(--color-navy-900)" }}>
          Hi, {d.va.name.split(" ")[0]}
        </h1>
      </div>

      {/* ── Focus hero ─────────────────────────────────────────────── */}
      <div className="hero-sky" style={{ padding: "26px 28px", marginBottom: 18 }}>
        <div className="hero-orb" />
        <div style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: 16 }}>
          <span style={{ flex: "none", width: 46, height: 46, borderRadius: 14, background: "var(--color-success)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 16px rgba(48,201,122,.35)" }}>
            <IconTrendingUp size={22} />
          </span>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: "0 0 5px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-2xl)", letterSpacing: "-.02em", color: "var(--color-navy-900)" }}>{heroTitle}</h2>
            <p style={{ margin: "0 0 16px", fontSize: "var(--text-md)", color: "var(--color-text-secondary)", lineHeight: 1.5, maxWidth: "52ch" }}>{heroSub}</p>
            <div style={{ display: "flex", alignItems: "stretch", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 190, background: "var(--color-surface)", border: "1px solid var(--color-sky-100)", borderRadius: "var(--radius-md)", padding: "13px 15px" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", fontWeight: 600, whiteSpace: "nowrap" }}>Hours this week</span>
                  <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--color-navy-900)", whiteSpace: "nowrap" }}>
                    {d.last7.toFixed(1)}
                    <span style={{ color: "var(--color-text-tertiary)", fontWeight: 500 }}>{targetWeek > 0 ? ` / ${targetWeek}h` : "h"}</span>
                  </span>
                </div>
                {targetWeek > 0 ? (
                  <div style={{ height: 7, borderRadius: 999, background: "var(--color-bg-tertiary)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${hoursPct}%`, borderRadius: 999, background: "linear-gradient(90deg, var(--color-sky-400), var(--color-success))" }} />
                  </div>
                ) : (
                  <div style={{ fontSize: "var(--text-2xs)", color: "var(--color-text-tertiary)" }}>No weekly target set</div>
                )}
              </div>
              <a href="/va/tasks" style={{ flex: "none", textDecoration: "none", background: "var(--color-surface)", border: "1px solid var(--color-sky-100)", borderRadius: "var(--radius-md)", padding: "13px 18px", textAlign: "center" }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-2xl)", color: "var(--color-navy-900)", lineHeight: 1 }}>{dueToday.length}</div>
                <div style={{ fontSize: "var(--text-2xs)", color: "var(--color-text-tertiary)", marginTop: 3 }}>due today</div>
              </a>
              <a href="/va/tasks" style={{ flex: "none", textDecoration: "none", background: "var(--color-surface)", border: `1px solid ${overdue.length ? "var(--color-error)" : "var(--color-sky-100)"}`, borderRadius: "var(--radius-md)", padding: "13px 18px", textAlign: "center" }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-2xl)", color: overdue.length ? "var(--color-error)" : "var(--color-navy-900)", lineHeight: 1 }}>{overdue.length}</div>
                <div style={{ fontSize: "var(--text-2xs)", color: "var(--color-text-tertiary)", marginTop: 3 }}>overdue</div>
              </a>
            </div>
          </div>
        </div>
        {d.checkinDue && (
          <div style={{ position: "relative", marginTop: 18, padding: "14px 16px", background: "var(--color-surface)", border: "1px solid var(--color-warning)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", gap: 13 }}>
            <span style={{ flex: "none", width: 34, height: 34, borderRadius: 10, background: "var(--color-warning-light)", color: "var(--color-warning-dark)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <IconCalendarCheck size={18} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-navy-900)" }}>Your monthly check-in is due</div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>A 2-minute pulse on your hours, availability, and workload.</div>
            </div>
            <a href="/va/checkin" className="btn btn-primary" style={{ height: 36 }}>Start check-in</a>
          </div>
        )}
      </div>

      {/* ── Stat row ───────────────────────────────────────────────── */}
      <div className="stat-grid" data-tour-el="/va">
        <Stat label="Hours · last 7 days" value={d.last7.toFixed(1)} unit="h" />
        <Stat label="Hours · last 14 days" value={d.last14.toFixed(1)} unit="h" />
        <Stat label="Cumulative" value={Math.round(d.cumulative)} unit="h" variant="navy" />
        <Stat label="Utilization" value={Math.round(d.utilizationPct)} unit="%" variant="sky" />
      </div>
      {(() => {
        // Surface how fresh the DeskLog feed is, so a stale 0% reads as "not synced yet" rather
        // than "you did no work". Ingest writes yesterday's data daily, so >3 days behind = delayed.
        const syncedThrough = d.deskLogSyncedThrough ? new Date(d.deskLogSyncedThrough) : null;
        const stale = syncedThrough ? Date.now() - syncedThrough.getTime() > 3 * 24 * 60 * 60 * 1000 : false;
        const asOf = syncedThrough ? syncedThrough.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
        return (
          <div className="small" style={{ marginTop: 8, color: stale ? "var(--color-warning-dark)" : "var(--color-text-tertiary)" }}>
            {asOf
              ? stale
                ? `⚠ Task-hour data is only synced through ${asOf} — your recent hours aren't counted yet, so utilization may read low. (Not a reflection of your work.)`
                : `Task-hour data synced through ${asOf}.`
              : "Task-hour data hasn't synced yet."}
          </div>
        );
      })()}

      {/* ── On your plate ──────────────────────────────────────────── */}
      <div className="sec-head">
        <h3 className="sec-title">On your plate today</h3>
        <a href="/va/tasks" style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-sky-600)", display: "inline-flex", alignItems: "center", gap: 4 }}>
          All tasks <IconChevronRight size={14} />
        </a>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {plate.length === 0 ? (
          <div className="surface" style={{ padding: "32px 20px", textAlign: "center", color: "var(--color-text-tertiary)" }}>
            <div style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--color-text-secondary)" }}>Nothing on your plate</div>
            <div className="small" style={{ marginTop: 4 }}>You&apos;re all caught up.</div>
          </div>
        ) : (
          plate.map((t) => (
            <div key={t.id} className="surface" style={{ padding: 16, position: "relative" }}>
              <a href={`/va/tasks/${t.id}`} aria-label={`Open ${t.title}`} style={{ position: "absolute", inset: 0, zIndex: 1, borderRadius: "inherit" }} />
              <div style={{ position: "relative", zIndex: 2, pointerEvents: "none", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{t.title}</div>
                  <div className="small" style={{ marginTop: 6, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, color: "var(--color-text-secondary)" }}>
                    {t.project && <span>{t.project.name}</span>}
                    {t.assignedBy.name && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>From <AssigneeChip name={t.assignedBy.name} /></span>
                    )}
                    <DueChip date={t.dueDate} status={t.status} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                  <PriorityBadge value={t.priority} />
                  <span style={{ pointerEvents: "auto" }}>
                    <StatusDropdown taskId={t.id} current={t.status} />
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Tier progress + recent activity ────────────────────────── */}
      <div className="glance-row" style={{ gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1fr)" }}>
        <div>
          <h3 className="sec-title" style={{ marginBottom: 12 }}>Tier progress</h3>
          <a href="/va/tier" className="surface" style={{ display: "block", padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: "var(--text-2xs)", color: "var(--color-text-tertiary)", fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" }}>Current</div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-lg)", color: "var(--color-navy-900)" }}>{humanRole(d.va.compensationRole)}</div>
              </div>
              <span style={{ color: "var(--color-text-tertiary)" }}><IconArrowRight size={18} /></span>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "var(--text-2xs)", color: "var(--color-text-tertiary)", fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" }}>Next</div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-lg)", color: "var(--color-sky-600)" }}>
                  {d.role?.nextRoleId ? humanRole(d.role.nextRoleId) : "Top tier"}
                </div>
              </div>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: "var(--color-bg-tertiary)", overflow: "hidden", marginBottom: 8 }}>
              <div style={{ height: "100%", width: `${tierPct}%`, borderRadius: 999, background: "linear-gradient(90deg, var(--color-sky-400), var(--color-success))" }} />
            </div>
            <div className="small">
              {d.role?.nextRoleId && d.hoursToNext != null ? (
                d.eligibility.eligible ? (
                  <>Eligible — <strong style={{ color: "var(--color-navy-900)" }}>pending HR review</strong>.</>
                ) : (
                  <><strong style={{ color: "var(--color-navy-900)" }}>{d.hoursToNext.toFixed(0)}h</strong> to go — you&apos;re <strong style={{ color: "var(--color-navy-900)" }}>{tierPct}%</strong> of the way to {humanRole(d.role.nextRoleId)}.</>
                )
              ) : (
                <>You&apos;re at the top of the current ladder.</>
              )}
            </div>
          </a>
        </div>
        <div>
          <h3 className="sec-title" style={{ marginBottom: 12 }}>Recent activity</h3>
          <div className="surface" style={{ padding: "4px 16px" }}>
            {d.myActivity.length === 0 ? (
              <div className="small" style={{ color: "var(--color-text-tertiary)", padding: "16px 0" }}>No recent activity.</div>
            ) : (
              d.myActivity.slice(0, 6).map((a, i, arr) => (
                <div key={a.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--color-border-subtle)" : "none" }}>
                  <span style={{ flex: "none", width: 8, height: 8, borderRadius: "50%", marginTop: 6, background: "var(--color-sky-400)" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "var(--text-sm)", lineHeight: 1.45 }}>{a.summary}</div>
                    <div style={{ fontSize: "var(--text-2xs)", color: "var(--color-text-tertiary)", marginTop: 2 }}>{a.timestamp.toLocaleDateString()}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <VaQuickActions defaults={{ targetHoursWeekly: d.va.targetHoursWeekly, skillSpecs: d.va.skillSpecs }} />
    </div>
  );
}

import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { viewForRole } from "@/lib/auth/roles";
import { getHrDashboard } from "@/lib/reads/hr";
import { db } from "@/lib/db";
import { Stat } from "@/components/ui/Stat";
import { StatusBadge, DueChip } from "@/components/ui/task-format";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/Avatar";
import {
  IconArrowRight,
  IconChevronRight,
  IconAlertTriangle,
  IconCheck,
  IconAward,
  IconClipboardCheck,
  IconMessageSquare,
} from "@/components/icons";

export const dynamic = "force-dynamic";

function humanRole(role: string): string {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function utilColor(pct: number): string {
  if (pct >= 110) return "var(--color-error)";
  if (pct >= 90) return "var(--color-success-dark)";
  if (pct < 50) return "var(--color-sky-700)";
  return "var(--color-text-secondary)";
}
function barColor(pct: number): string {
  if (pct >= 110) return "var(--color-error)";
  if (pct < 50) return "var(--color-sky-400)";
  return "var(--color-success)";
}

type Decision = {
  key: string;
  tag: string;
  tagColor: string;
  iconBg: string;
  iconColor: string;
  icon: ReactNode;
  title: string;
  sub: string;
  href: string;
  cta: string;
};

export default async function HrDashboard() {
  const user = await getCurrentUser();
  // Guard the HR console: only HR-view roles (and admins) land here — others
  // (SALES, RECRUITER, VA …) go to their own home.
  if (viewForRole(user.role) !== "HR" && !user.isAdmin) redirect("/");
  const d = await getHrDashboard();

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const decisions: Decision[] = [
    ...d.pendingReviews.map((r) => ({
      key: `tier-${r.id}`,
      tag: "Tier review",
      tagColor: "var(--color-navy-600)",
      iconBg: "var(--color-navy-50)",
      iconColor: "var(--color-navy-700)",
      icon: <IconAward size={18} />,
      title: r.vaName ?? r.vaId,
      sub: `${r.currentRole ? humanRole(r.currentRole) : "—"} → ${r.targetRole ? humanRole(r.targetRole) : "next"} · ${Math.round(r.cumulativeHoursAtTrigger ?? 0)}h · ${r.daysWaiting}d waiting`,
      href: "/hr/reviews",
      cta: "Review",
    })),
    ...d.openEvaluations.map((e) => ({
      key: `eval-${e.evaluationId}`,
      tag: "Evaluation",
      tagColor: "var(--color-sky-700)",
      iconBg: "var(--color-sky-50)",
      iconColor: "var(--color-sky-700)",
      icon: <IconClipboardCheck size={18} />,
      title: e.va?.name ?? e.vaId,
      sub: `Evaluation ${e.status.replace(/_/g, " ")}`,
      href: "/hr/evaluations",
      cta: "Open",
    })),
    ...d.capacityFlags.map((c) => ({
      key: `cap-${c.va.vaId}`,
      tag: c.overburdened ? "Overloaded" : "Underused",
      tagColor: c.overburdened ? "var(--color-error-dark)" : "var(--color-sky-700)",
      iconBg: c.overburdened ? "var(--color-error-light)" : "var(--color-sky-50)",
      iconColor: c.overburdened ? "var(--color-error-dark)" : "var(--color-sky-700)",
      icon: <IconAlertTriangle size={18} />,
      title: c.va.name,
      sub: `${Math.round(c.utilizationPct)}% utilization · ${c.last14dHours.toFixed(1)}h logged · ${c.atWork14dHours.toFixed(1)}h at work / 2wk`,
      href: "/hr/capacity",
      cta: "Review",
    })),
    ...d.incomingRequests.map((q) => ({
      key: `req-${q.id}`,
      tag: "Client request",
      tagColor: "var(--color-sky-700)",
      iconBg: "var(--color-sky-50)",
      iconColor: "var(--color-sky-700)",
      icon: <IconMessageSquare size={18} />,
      title: q.title,
      sub: `${q.clientOrganization?.name ?? "Client"} · ${q.priorityPreference} priority`,
      href: "/hr/requests",
      cta: "Triage",
    })),
  ];

  const overloadedNames = d.workload.filter((w) => w.overburdened).map((w) => w.name);
  const glance = d.workload.slice(0, 6);

  // OS Hub strip (design's dashboard): due-soon tasks + recent hub activity.
  const [dueSoon, hubActivity, pendingMeeting] = await Promise.all([
    db.task.findMany({
      where: { status: { not: "Done" }, dueDate: { not: null } },
      orderBy: { dueDate: "asc" },
      take: 4,
      select: { id: true, title: true, status: true, dueDate: true },
    }),
    db.activityLog.findMany({
      where: { source: { in: ["project_action", "page_action", "scratch_action", "field_action", "link_action", "task_action"] } },
      orderBy: { timestamp: "desc" },
      take: 4,
      select: { id: true, summary: true, timestamp: true },
    }),
    db.meetingActionItem.count({ where: { status: "PENDING" } }),
  ]);

  return (
    <div className="dash-stage">
      {/* ── Triage hero + team health ─────────────────────────────── */}
      <div className="hero-row">
        <div className="hero-navy" style={{ padding: "24px 26px" }}>
          <div className="hero-orb" />
          <div style={{ position: "relative" }}>
            <div style={{ fontSize: "var(--text-sm)", color: "rgba(255,255,255,.6)", fontWeight: 600 }}>{today}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "6px 0 4px" }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 52, lineHeight: 1, letterSpacing: "-.03em" }}>
                {d.decisionCount}
              </span>
              <span style={{ fontSize: "var(--text-lg)", color: "rgba(255,255,255,.7)", fontWeight: 600 }}>
                {d.decisionCount === 1 ? "decision needs" : "decisions need"} you today
              </span>
            </div>
            <p style={{ margin: "8px 0 16px", fontSize: "var(--text-sm)", color: "rgba(255,255,255,.72)", lineHeight: 1.5, maxWidth: "44ch" }}>
              Tier reviews, evaluations, capacity flags, and new client requests — triaged into one queue so nothing slips.
            </p>
            <a href="#decisions" className="btn" style={{ background: "#fff", color: "var(--color-navy-900)" }}>
              Review decisions <IconArrowRight size={16} />
            </a>
          </div>
        </div>

        <div className="surface" style={{ borderRadius: "var(--radius-card)", padding: "22px 24px" }}>
          <div className="sec-head">
            <h3 className="sec-title" style={{ fontSize: "var(--text-base)" }}>Team health</h3>
            <a href="/hr/workload" style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-sky-600)" }}>Workload</a>
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: overloadedNames.length ? 18 : 0 }}>
            <HealthCell n={d.health.healthy} label="Healthy" bg="var(--color-success-light)" fg="var(--color-success-dark)" />
            <HealthCell n={d.health.overloaded} label="Overloaded" bg={d.health.overloaded ? "var(--color-error-light)" : "var(--color-bg-secondary)"} fg="var(--color-error-dark)" />
            <HealthCell n={d.health.underused} label="Underused" bg="var(--color-sky-50)" fg="var(--color-sky-700)" />
          </div>
          {overloadedNames.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", borderRadius: "var(--radius-md)", background: "var(--color-error-light)", border: "1px solid rgba(240,76,76,.22)" }}>
              <span style={{ color: "var(--color-error-dark)", display: "flex", flex: "none" }}><IconAlertTriangle size={18} /></span>
              <div style={{ flex: 1, minWidth: 0, fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
                {overloadedNames.slice(0, 2).join(", ")}
                {overloadedNames.length > 2 ? ` +${overloadedNames.length - 2}` : ""} {overloadedNames.length === 1 ? "is" : "are"} over capacity
              </div>
              <div style={{ display: "flex" }}>
                {overloadedNames.slice(0, 3).map((n, i) => (
                  <Avatar key={n} name={n} size={26} ring style={{ marginLeft: i ? -8 : 0 }} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Stat row ───────────────────────────────────────────────── */}
      <div className="stat-grid" data-tour-el="/hr">
        <Stat label="Pending tier reviews" value={d.pendingReviews.length} variant={d.pendingReviews.length ? "navy" : "default"} />
        <Stat label="Active VAs" value={d.totalActive} />
        <Stat label="Capacity flags" value={d.capacityFlags.length} trend={d.capacityFlags.length ? "down" : "neutral"} />
        <Stat label="Check-ins this month" value={d.checkinsThisMonth} changeLabel={`of ${d.totalActive} VAs`} variant="sky" />
      </div>

      {/* ── OS Hub strip: due soon + recent activity (design dashboard) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18, alignItems: "start", margin: "18px 0" }}>
        <div className="surface" style={{ borderRadius: "var(--radius-card)", padding: "18px 22px" }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
            <h3 className="sec-title" style={{ fontSize: "var(--text-base)", margin: 0 }}>Due soon</h3>
            <a href="/hr/tasks" style={{ marginLeft: "auto", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-sky-600)" }}>
              View all tasks
            </a>
          </div>
          {dueSoon.length === 0 && (
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>Nothing due — enjoy it.</p>
          )}
          {dueSoon.map((t) => (
            <a
              key={t.id}
              href={`/hr/tasks/${t.id}`}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", margin: "0 -10px", borderRadius: 12, textDecoration: "none" }}
            >
              <span style={{ flex: 1, minWidth: 0, fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--color-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {t.title}
              </span>
              <StatusBadge value={t.status} />
              <DueChip date={t.dueDate} status={t.status} />
            </a>
          ))}
          {pendingMeeting > 0 && (
            <a
              href="/meeting-actions"
              className="btn"
              style={{ marginTop: 10, background: "var(--color-navy-900, #132272)", color: "#fff", borderRadius: 999 }}
            >
              Review meeting actions ({pendingMeeting})
            </a>
          )}
        </div>
        <div className="surface" style={{ borderRadius: "var(--radius-card)", padding: "18px 22px" }}>
          <h3 className="sec-title" style={{ fontSize: "var(--text-base)", margin: "0 0 10px" }}>Recent activity</h3>
          {hubActivity.length === 0 && (
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>No hub activity yet.</p>
          )}
          {hubActivity.map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "7px 0" }}>
              <span style={{ flex: "none", width: 26, height: 26, borderRadius: 9, background: "var(--color-sky-50, #f0fafd)", border: "1px solid var(--color-sky-100, #c9edf8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>
                ⚡
              </span>
              <span style={{ flex: 1, fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", lineHeight: 1.45 }}>{a.summary}</span>
              <span style={{ flex: "none", fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", whiteSpace: "nowrap" }}>
                {a.timestamp.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Decision queue ─────────────────────────────────────────── */}
      <div id="decisions" className="sec-head" style={{ scrollMarginTop: 80 }}>
        <h3 className="sec-title">Needs a decision today</h3>
        <span className="small" style={{ color: "var(--color-text-tertiary)" }}>{decisions.length} open</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {decisions.length === 0 ? (
          <div style={{ textAlign: "center", padding: "44px 20px", background: "var(--color-surface)", border: "1px solid var(--color-border-subtle)", borderRadius: "var(--radius-lg)" }}>
            <span style={{ display: "inline-flex", width: 48, height: 48, borderRadius: "50%", background: "var(--color-success-light)", color: "var(--color-success-dark)", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <IconCheck size={24} />
            </span>
            <div style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--color-navy-900)", fontFamily: "var(--font-display)" }}>All clear</div>
            <div className="small" style={{ color: "var(--color-text-tertiary)", marginTop: 3 }}>Nothing needs a decision right now. Nicely done.</div>
          </div>
        ) : (
          decisions.map((dec) => (
            <div key={dec.key} style={{ background: "var(--color-surface)", border: "1px solid var(--color-border-subtle)", borderRadius: "var(--radius-lg)", padding: "15px 18px", display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ flex: "none", width: 38, height: 38, borderRadius: 11, background: dec.iconBg, color: dec.iconColor, display: "flex", alignItems: "center", justifyContent: "center" }}>{dec.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "var(--text-2xs)", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: dec.tagColor, marginBottom: 2 }}>{dec.tag}</div>
                <div style={{ fontSize: "var(--text-base)", fontWeight: 600, color: "var(--color-text-primary)" }}>{dec.title}</div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: 1 }}>{dec.sub}</div>
              </div>
              <a href={dec.href} className="btn btn-ghost" style={{ height: 36 }}>{dec.cta}</a>
            </div>
          ))
        )}
      </div>

      {/* ── Workload glance + recent activity ──────────────────────── */}
      <div className="glance-row">
        <div>
          <div className="sec-head">
            <h3 className="sec-title">Team workload</h3>
            <a href="/hr/workload" style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-sky-600)", display: "inline-flex", alignItems: "center", gap: 4 }}>
              All VAs <IconChevronRight size={14} />
            </a>
          </div>
          <div className="surface" style={{ padding: "6px 18px" }}>
            {glance.map((w, i) => (
              <div key={w.vaId} style={{ display: "flex", alignItems: "center", gap: 13, padding: "12px 0", borderBottom: i < glance.length - 1 ? "1px solid var(--color-border-subtle)" : "none" }}>
                <Avatar name={w.name} size={34} />
                <div style={{ width: 130, flex: "none", minWidth: 0 }}>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{w.name}</div>
                  <div style={{ fontSize: "var(--text-2xs)", color: "var(--color-text-tertiary)" }}>{humanRole(w.role)}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ height: 8, borderRadius: 999, background: "var(--color-bg-tertiary)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, w.utilizationPct)}%`, borderRadius: 999, background: barColor(w.utilizationPct) }} />
                  </div>
                </div>
                <span style={{ flex: "none", width: 50, textAlign: "right", fontSize: "var(--text-xs)", fontWeight: 600, color: utilColor(w.utilizationPct) }}>{Math.round(w.utilizationPct)}%</span>
                <span style={{ flex: "none", width: 92, display: "flex", justifyContent: "flex-end" }}>
                  {w.overburdened ? <Badge variant="danger" size="sm" dot>Over</Badge> : w.underutilized ? <Badge variant="sky" size="sm" dot>Under</Badge> : null}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="sec-title" style={{ marginBottom: 12 }}>Recent activity</h3>
          <div className="surface" style={{ padding: "4px 16px" }}>
            {d.recentActivity.length === 0 ? (
              <div className="small" style={{ color: "var(--color-text-tertiary)", padding: "16px 0" }}>No activity yet.</div>
            ) : (
              d.recentActivity.slice(0, 8).map((a, i, arr) => (
                <div key={a.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--color-border-subtle)" : "none" }}>
                  <span style={{ flex: "none", width: 8, height: 8, borderRadius: "50%", marginTop: 6, background: dotColor(a.severity) }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "var(--text-sm)", lineHeight: 1.45 }}>{a.summary}</div>
                    <div style={{ fontSize: "var(--text-2xs)", color: "var(--color-text-tertiary)", marginTop: 2 }}>
                      {a.source} · {a.timestamp.toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HealthCell({ n, label, bg, fg }: { n: number; label: string; bg: string; fg: string }) {
  return (
    <div style={{ flex: 1, textAlign: "center", padding: "12px 8px", borderRadius: "var(--radius-md)", background: bg }}>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-2xl)", color: fg, lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: "var(--text-2xs)", color: fg, marginTop: 3, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function dotColor(sev: string): string {
  if (sev === "success") return "var(--color-success)";
  if (sev === "warning") return "var(--color-warning)";
  if (sev === "error") return "var(--color-error)";
  return "var(--color-sky-500)";
}

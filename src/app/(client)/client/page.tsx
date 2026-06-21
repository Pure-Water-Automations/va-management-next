import { getCurrentUser } from "@/lib/auth/access";
import { getClientMembership, assertClientRole } from "@/lib/auth/client";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { listClientRecordings } from "@/lib/reads/client-recordings";
import { Avatar } from "@/components/Avatar";
import { IconShieldCheck, IconChevronRight, IconPlay } from "@/components/icons";

export const dynamic = "force-dynamic";

const ACTIVE_REQ = ["RECEIVED", "TRIAGE_NEEDED", "READY_TO_ASSIGN", "ASSIGNED"] as const;
const STEPS = ["Received", "Reviewing", "Assigning", "In progress"];
const STEP_OF: Record<string, number> = { RECEIVED: 0, TRIAGE_NEEDED: 1, READY_TO_ASSIGN: 2, ASSIGNED: 3 };

function fmtDuration(sec: number | null): string {
  if (!sec || sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default async function ClientDashboardPage() {
  const user = await getCurrentUser();
  assertClientRole(user);
  const membership = await getClientMembership(user.id);
  if (!membership) redirect("/client/no-access");

  const orgId = membership.clientOrganizationId;
  const firstName = (user.name ?? "there").split(" ")[0];

  const [activeRequests, activeProjectCount, recentComments, projects, videos] = await Promise.all([
    db.clientTaskRequest.findMany({
      where: { clientOrganizationId: orgId, status: { in: [...ACTIVE_REQ] } },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
        assignedTask: { select: { assignedTo: { select: { name: true } } } },
      },
    }),
    db.project.count({ where: { clientOrganizationId: orgId, status: { in: ["Planning", "Active"] } } }),
    db.taskComment.findMany({
      where: { visibility: "CLIENT_VISIBLE", task: { clientOrganizationId: orgId } },
      select: { id: true, body: true, createdAt: true, author: { select: { name: true } }, task: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    db.project.findMany({ where: { clientOrganizationId: orgId }, select: { owner: { select: { name: true } } }, take: 20 }),
    listClientRecordings(orgId),
  ]);

  const handledCount = activeRequests.length + activeProjectCount;
  const teamNames = Array.from(
    new Set([
      ...projects.map((p) => p.owner?.name).filter(Boolean),
      ...activeRequests.map((r) => r.assignedTask?.assignedTo?.name).filter(Boolean),
    ] as string[]),
  ).slice(0, 4);

  return (
    <div className="dash-stage">
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)", fontWeight: 600 }}>
          {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </div>
        <h1 style={{ margin: "4px 0 0", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-4xl)", letterSpacing: "-.03em", color: "var(--color-navy-900)" }}>
          Hi, {firstName}
        </h1>
      </div>

      {/* ── Reassurance hero ───────────────────────────────────────── */}
      <div className="hero-sky" style={{ padding: "26px 28px", marginBottom: 18 }}>
        <div className="hero-orb" />
        <div style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: 16 }}>
          <span style={{ flex: "none", width: 46, height: 46, borderRadius: 14, background: "var(--color-success)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 16px rgba(48,201,122,.35)" }}>
            <IconShieldCheck size={22} />
          </span>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: "0 0 5px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-2xl)", letterSpacing: "-.02em", color: "var(--color-navy-900)" }}>
              {handledCount > 0 ? "Your team is on it" : "All caught up"}
            </h2>
            <p style={{ margin: "0 0 14px", fontSize: "var(--text-md)", color: "var(--color-text-secondary)", lineHeight: 1.5, maxWidth: "46ch" }}>
              {handledCount > 0
                ? "Here’s what we’re working on for you right now. Ask for anything anytime."
                : "Nothing in motion right now. Submit a request and we’ll pick it up."}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--color-sky-400)" }} />
                <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}><strong style={{ color: "var(--color-navy-900)" }}>{handledCount}</strong> being handled</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--color-success)" }} />
                <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}><strong style={{ color: "var(--color-navy-900)" }}>{recentComments.length}</strong> recent updates</span>
              </div>
              {teamNames.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 2 }}>
                  <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>Your team</span>
                  <div style={{ display: "flex" }}>
                    {teamNames.map((n, i) => (
                      <Avatar key={n} name={n} size={26} ring style={{ marginLeft: i ? -8 : 0 }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── In motion ──────────────────────────────────────────────── */}
      <div className="sec-head">
        <h3 className="sec-title">In motion right now</h3>
        <a href="/client/requests" style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-sky-600)", display: "inline-flex", alignItems: "center", gap: 4 }}>
          All requests <IconChevronRight size={14} />
        </a>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {activeRequests.length === 0 ? (
          <div className="surface" style={{ padding: "32px 20px", textAlign: "center", color: "var(--color-text-tertiary)" }}>
            <div style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--color-text-secondary)" }}>Nothing in motion</div>
            <div className="small" style={{ marginTop: 4 }}>Submit a request and your team will take it from there.</div>
          </div>
        ) : (
          activeRequests.map((r) => {
            const step = STEP_OF[r.status] ?? 0;
            const owner = r.assignedTask?.assignedTo?.name;
            return (
              <a key={r.id} href="/client/requests" className="surface" style={{ display: "block", padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "var(--text-base)", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 9 }}>{r.title}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {STEPS.map((label, i) => (
                        <span key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "var(--text-2xs)", fontWeight: 600, color: i <= step ? "var(--color-sky-700)" : "var(--color-text-tertiary)" }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: i <= step ? "var(--color-sky-400)" : "var(--color-border)" }} />
                            {label}
                          </span>
                          {i < STEPS.length - 1 && <span style={{ width: 16, height: 1, background: i < step ? "var(--color-sky-200)" : "var(--color-border-subtle)" }} />}
                        </span>
                      ))}
                    </div>
                  </div>
                  {owner && (
                    <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar name={owner} size={28} />
                      <div>
                        <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.1 }}>{owner}</div>
                        <div style={{ fontSize: "var(--text-2xs)", color: "var(--color-text-tertiary)" }}>updated {r.updatedAt.toLocaleDateString()}</div>
                      </div>
                    </div>
                  )}
                </div>
              </a>
            );
          })
        )}
      </div>

      {/* ── Recent updates + latest videos ─────────────────────────── */}
      <div className="glance-row" style={{ gridTemplateColumns: "minmax(0,1.25fr) minmax(0,1fr)" }}>
        <div>
          <h3 className="sec-title" style={{ marginBottom: 12 }}>Recent updates</h3>
          <div className="surface" style={{ padding: "6px 18px" }}>
            {recentComments.length === 0 ? (
              <div className="small" style={{ color: "var(--color-text-tertiary)", padding: "16px 0" }}>No updates yet.</div>
            ) : (
              recentComments.map((c, i, arr) => (
                <div key={c.id} style={{ display: "flex", gap: 13, padding: "13px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--color-border-subtle)" : "none" }}>
                  <Avatar name={c.author.name ?? "Team"} size={30} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)", lineHeight: 1.45 }}>
                      <strong style={{ fontWeight: 600 }}>{c.author.name ?? "Team"}</strong> on{" "}
                      <strong style={{ color: "var(--color-text-secondary)", fontWeight: 600 }}>{c.task.title}</strong>: {c.body}
                    </div>
                    <div style={{ fontSize: "var(--text-2xs)", color: "var(--color-text-tertiary)", marginTop: 2 }}>{new Date(c.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div>
          <div className="sec-head">
            <h3 className="sec-title">Latest videos</h3>
            <a href="/client/recordings" style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-sky-600)" }}>See all</a>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {videos.length === 0 ? (
              <div className="surface" style={{ padding: "20px" }}>
                <span className="small" style={{ color: "var(--color-text-tertiary)" }}>No videos shared yet.</span>
              </div>
            ) : (
              videos.slice(0, 2).map((v) => (
                <a key={v.id} href={`/client/recordings/${v.id}`} className="surface" style={{ overflow: "hidden", display: "block" }}>
                  <div style={{ position: "relative", aspectRatio: "16/9", background: "linear-gradient(150deg, #0e1730, #0b1220 60%, #0a1a28)", display: "flex", alignItems: "center", justifyContent: "center", backgroundSize: "cover", backgroundPosition: "center", ...(v.thumbnailUrl ? { backgroundImage: `url(${v.thumbnailUrl})` } : {}) }}>
                    {!v.thumbnailUrl && <div style={{ position: "absolute", inset: 0, background: "radial-gradient(70% 70% at 50% 40%, rgba(77,196,232,.16), transparent 70%)" }} />}
                    <span style={{ position: "relative", width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,.92)", color: "var(--color-navy-900)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--shadow-md)" }}>
                      <IconPlay size={15} />
                    </span>
                    {v.durationSec ? (
                      <span style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(13,18,32,.78)", color: "#fff", fontSize: "var(--text-2xs)", fontWeight: 600, padding: "2px 7px", borderRadius: 999 }}>{fmtDuration(v.durationSec)}</span>
                    ) : null}
                    {v.isNew && <span style={{ position: "absolute", top: 8, left: 8, background: "var(--color-sky-400)", color: "#fff", fontSize: "var(--text-2xs)", fontWeight: 700, textTransform: "uppercase", padding: "2px 7px", borderRadius: 999 }}>New</span>}
                  </div>
                  <div style={{ padding: "11px 13px" }}>
                    <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.3, marginBottom: 5 }}>{v.title}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <Avatar name={v.presenter} size={18} />
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>{v.presenter} · {v.createdAt.toLocaleDateString()}</span>
                    </div>
                  </div>
                </a>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

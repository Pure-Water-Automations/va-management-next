import { getCurrentUser, isAllAccess } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getMyClientIds } from "@/lib/reads/team";
import { Stat } from "@/components/ui/Stat";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/Avatar";

const OPEN_REQUEST_STATUSES = ["RECEIVED", "TRIAGE_NEEDED", "READY_TO_ASSIGN"] as const;

/** Compact $ for the "Monthly recurring" KPI, e.g. 10600 -> "$10.6k". */
function compactMoney(n: number): string {
  if (!n) return "$0";
  if (n >= 1000) {
    const k = n / 1000;
    return "$" + (k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")) + "k";
  }
  return "$" + Math.round(n).toLocaleString();
}

/** Per-org MRR string, e.g. "$2,400/mo" — only retainer deals are monthly recurring. */
function mrrLabel(dealValue: number | null | undefined, billingType: string | null | undefined): string {
  if (billingType === "retainer" && dealValue) return "$" + Math.round(dealValue).toLocaleString() + "/mo";
  return "—";
}

type OrgStatus = "active" | "onboarding" | "paused" | "churned";

function statusBadge(status: OrgStatus) {
  switch (status) {
    case "active":
      return <Badge variant="success">Active</Badge>;
    case "onboarding":
      return <Badge variant="sky">Onboarding</Badge>;
    case "paused":
      return <Badge variant="warning">Paused</Badge>;
    default:
      return <Badge variant="default">Churned</Badge>;
  }
}

function monogram(name: string, size = 46) {
  const initials = name
    .replace(/[^A-Za-z ]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span
      style={{
        width: size,
        height: size,
        flex: "none",
        borderRadius: Math.round(size * 0.26),
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: Math.round(size * 0.34),
        color: "#fff",
        background: "linear-gradient(145deg,#2f48b4,#132272)",
        boxShadow: "0 1px 3px rgba(0,0,0,.16)",
      }}
    >
      {initials || "·"}
    </span>
  );
}

function pillChip({ label, count, active, href }: { label: string; count: number; active: boolean; href: string }) {
  return (
    <Link
      key={label}
      href={href}
      style={{
        textDecoration: "none",
        fontSize: "var(--text-sm)",
        fontWeight: 600,
        padding: "7px 14px",
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        transition: "all .15s",
        background: active ? "var(--color-navy-900)" : "var(--color-surface)",
        color: active ? "#fff" : "var(--color-text-secondary)",
        border: `1px solid ${active ? "var(--color-navy-900)" : "var(--color-border)"}`,
      }}
    >
      {label}
      <span style={{ fontSize: "var(--text-2xs)", opacity: 0.7 }}>{count}</span>
    </Link>
  );
}

export default async function HrClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ mine?: string; status?: string }>;
}) {
  const user = await getCurrentUser();
  // All-access (admin OR TESTER) must reach the client list, matching the org detail
  // page guard — otherwise a non-admin TESTER is bounced to /hr and can't test clients.
  if (user.role !== "HR_MANAGER" && user.role !== "PEOPLE_OPS" && !isAllAccess(user)) {
    redirect("/hr");
  }
  const sp = await searchParams;
  const onlyMine = sp.mine === "1";
  const statusFilter = (sp.status ?? "all").toLowerCase();

  const [allOrgs, myClientIds] = await Promise.all([
    db.clientOrganization.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        active: true,
        _count: {
          select: {
            projects: true,
            taskRequests: { where: { status: { in: [...OPEN_REQUEST_STATUSES] } } },
          },
        },
        deal: {
          select: { packageName: true, dealValue: true, billingType: true, contactName: true },
        },
        assignments: {
          select: {
            role: true,
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    getMyClientIds(user.id),
  ]);

  // KPI row (over ALL orgs, mirrors the prototype's counts).
  const orgActive = allOrgs.filter((o) => o.status === "active").length;
  const orgOnboard = allOrgs.filter((o) => o.status === "onboarding").length;
  const orgRisk = allOrgs.filter((o) => o.status === "paused" || o.status === "churned").length;
  // Monthly recurring = compact $ sum of active orgs' retainer dealValue.
  const mrrSum = allOrgs
    .filter((o) => o.status === "active" && o.deal?.billingType === "retainer")
    .reduce((s, o) => s + (o.deal?.dealValue ?? 0), 0);

  // Filter-chip counts (over the mine-scope so chip totals match what's shown).
  const scoped = onlyMine ? allOrgs.filter((o) => myClientIds.has(o.id)) : allOrgs;
  const chipCounts = {
    all: scoped.length,
    active: scoped.filter((o) => o.status === "active").length,
    onboarding: scoped.filter((o) => o.status === "onboarding").length,
    paused: scoped.filter((o) => o.status === "paused").length,
  };

  const visible = scoped.filter((o) => statusFilter === "all" || o.status === statusFilter);

  const mineQS = onlyMine ? "&mine=1" : "";

  return (
    <>
      <style>{`.cl-org-card{transition:box-shadow .2s cubic-bezier(.25,.46,.45,.94),transform .2s cubic-bezier(.25,.46,.45,.94)}.cl-org-card:hover{box-shadow:var(--shadow-md);transform:translateY(-2px)}`}</style>
      <div className="page-head">
        <div>
          <div className="crumb">Clients</div>
          <h1>Organizations</h1>
        </div>
        <div style={{ display: "flex", gap: 8, alignSelf: "center" }}>
          <a href="/hr/clients/new" className="btn btn-primary">
            + New Organization
          </a>
        </div>
      </div>

      <div className="stat-grid">
        <Stat label="Active clients" value={orgActive} variant={orgActive ? "navy" : "default"} />
        <Stat label="In onboarding" value={orgOnboard} variant="sky" />
        <Stat label="Monthly recurring" value={compactMoney(mrrSum)} />
        <Stat label="Paused / at-risk" value={orgRisk} trend={orgRisk ? "down" : "neutral"} />
      </div>

      {/* Status filter chips */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {pillChip({ label: "All", count: chipCounts.all, active: statusFilter === "all", href: `/hr/clients?status=all${mineQS}` })}
        {pillChip({ label: "Active", count: chipCounts.active, active: statusFilter === "active", href: `/hr/clients?status=active${mineQS}` })}
        {pillChip({ label: "Onboarding", count: chipCounts.onboarding, active: statusFilter === "onboarding", href: `/hr/clients?status=onboarding${mineQS}` })}
        {pillChip({ label: "Paused", count: chipCounts.paused, active: statusFilter === "paused", href: `/hr/clients?status=paused${mineQS}` })}
      </div>

      {/* All / My clients toggle (preserved) */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 22 }}>
        {pillChip({ label: "All clients", count: allOrgs.length, active: !onlyMine, href: `/hr/clients?status=${statusFilter}` })}
        {pillChip({ label: "My clients", count: myClientIds.size, active: onlyMine, href: `/hr/clients?status=${statusFilter}&mine=1` })}
      </div>

      {visible.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: 44,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "var(--radius-lg)",
            color: "var(--color-text-tertiary)",
            fontSize: "var(--text-sm)",
          }}
        >
          {onlyMine ? "You're not assigned to any clients yet." : "No client organizations match this filter."}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(282px,1fr))", gap: 16 }}>
          {visible.map((org) => {
            const vas = org.assignments.filter((a) => a.role === "MEMBER");
            const vaNames = vas.map((a) => a.user.name ?? a.user.email);
            const openReqs = org._count.taskRequests;
            const planLine = org.deal?.packageName ?? "No active plan";
            const mrr = mrrLabel(org.deal?.dealValue, org.deal?.billingType);
            return (
              <Link
                key={org.id}
                href={`/hr/clients/${org.slug}`}
                className="cl-org-card"
                style={{
                  display: "block",
                  textDecoration: "none",
                  color: "inherit",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border-subtle)",
                  borderRadius: "var(--radius-card)",
                  padding: 20,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 15 }}>
                  {monogram(org.name, 46)}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: "var(--font-display)",
                        fontWeight: 700,
                        fontSize: "var(--text-base)",
                        color: "var(--color-navy-900)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {org.name}
                    </div>
                    <div
                      style={{
                        fontSize: "var(--text-2xs)",
                        color: "var(--color-text-tertiary)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {planLine}
                    </div>
                  </div>
                  {statusBadge(org.status as OrgStatus)}
                </div>

                {/* VA avatar stack */}
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 15, minHeight: 26 }}>
                  {vaNames.length > 0 ? (
                    <span style={{ display: "inline-flex", alignItems: "center" }}>
                      {vaNames.slice(0, 4).map((n, i) => (
                        <span
                          key={i}
                          style={{
                            marginLeft: i ? -8 : 0,
                            border: "2px solid var(--color-surface)",
                            borderRadius: "50%",
                            display: "inline-flex",
                          }}
                        >
                          <Avatar name={n} size={26} />
                        </span>
                      ))}
                      {vaNames.length > 4 && (
                        <span
                          style={{
                            marginLeft: -8,
                            width: 26,
                            height: 26,
                            borderRadius: "50%",
                            border: "2px solid var(--color-surface)",
                            background: "var(--color-bg-tertiary)",
                            color: "var(--color-text-secondary)",
                            fontSize: 11,
                            fontWeight: 700,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          +{vaNames.length - 4}
                        </span>
                      )}
                    </span>
                  ) : null}
                  <span style={{ fontSize: "var(--text-2xs)", color: "var(--color-text-tertiary)" }}>
                    {vaNames.length > 0 ? `${vaNames.length} VA${vaNames.length > 1 ? "s" : ""}` : "Unassigned"}
                  </span>
                </div>

                {/* Footer */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingTop: 13,
                    borderTop: "1px solid var(--color-border-subtle)",
                  }}
                >
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
                    {org._count.projects} project{org._count.projects !== 1 ? "s" : ""} · {openReqs} open
                  </span>
                  <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--color-navy-900)" }}>{mrr}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

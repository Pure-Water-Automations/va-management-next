import { getCurrentUser, isBetaVisible, isAllAccess } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { NotionConnectForm } from "@/components/NotionConnectForm";
import { NotionHelp } from "@/components/NotionHelp";
import { notionOauthConfigured } from "@/lib/notion-oauth";
import { needsDatabasePick } from "@/lib/notion-engine";
import { ClientTeamManager } from "@/components/ClientTeamManager";
import { getClientTeam, getAssignableStaff } from "@/lib/reads/team";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/Avatar";

const OPEN_REQUEST_STATUSES = ["RECEIVED", "TRIAGE_NEEDED", "READY_TO_ASSIGN"] as const;

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

function mrrLabel(dealValue: number | null | undefined, billingType: string | null | undefined): string {
  if (billingType === "retainer" && dealValue) return "$" + Math.round(dealValue).toLocaleString() + "/mo";
  if (billingType === "project" && dealValue) return "$" + Math.round(dealValue).toLocaleString();
  if (billingType === "hourly" && dealValue) return "$" + Math.round(dealValue).toLocaleString() + "/hr";
  return "—";
}

function monogram(name: string, size = 54) {
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
        color: "var(--color-navy-900)",
        background: "rgba(255,255,255,0.92)",
        boxShadow: "0 1px 3px rgba(0,0,0,.2)",
      }}
    >
      {initials || "·"}
    </span>
  );
}

function statTile(label: string, value: string | number) {
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border-subtle)",
        borderRadius: "var(--radius-lg)",
        padding: "16px 18px",
        flex: 1,
        minWidth: 140,
      }}
    >
      <div
        style={{
          fontSize: "var(--text-xs)",
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--color-text-tertiary)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: "var(--text-2xl)",
          color: "var(--color-navy-900)",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function sectionLabel(text: string) {
  return (
    <div
      style={{
        fontSize: "var(--text-xs)",
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--color-text-tertiary)",
        marginBottom: 8,
      }}
    >
      {text}
    </div>
  );
}

export default async function HrClientOrgPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (user.role !== "HR_MANAGER" && user.role !== "PEOPLE_OPS" && !isAllAccess(user)) {
    redirect("/hr");
  }

  const org = await db.clientOrganization.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      active: true,
      notionId: true,
      deal: {
        select: { packageName: true, dealValue: true, billingType: true, contactName: true },
      },
      memberships: {
        select: {
          id: true,
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      },
      projects: {
        select: { id: true, name: true, status: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      _count: {
        select: {
          projects: true,
          taskRequests: { where: { status: { in: [...OPEN_REQUEST_STATUSES] } } },
        },
      },
      notionConnection: {
        select: {
          active: true,
          projectsDatabaseId: true,
          tasksDatabaseId: true,
          statusProperty: true,
          lastSyncedAt: true,
          lastSyncSummary: true,
        },
      },
    },
  });

  if (!org) notFound();

  const [team, staff] = await Promise.all([getClientTeam(org.id), getAssignableStaff()]);
  const betaVisible = await isBetaVisible(user.email);
  const conn = org.notionConnection;
  const oauthConfigured = notionOauthConfigured();
  const needsPick = betaVisible ? await needsDatabasePick(org.id) : false;
  const fullyConnected = !!conn?.active && !!(conn.projectsDatabaseId || conn.tasksDatabaseId);

  const lead = team.find((m) => m.role === "LEAD") ?? null;
  const vas = team.filter((m) => m.role === "MEMBER");
  const openReqs = org._count.taskRequests;
  const mrr = mrrLabel(org.deal?.dealValue, org.deal?.billingType);
  const primaryContact = org.deal?.contactName ?? "—";
  const planLine = org.deal?.packageName ?? "No active plan";
  const activeProjects = org.projects.filter((p) => p.status === "Active");
  const profileProjects = activeProjects.length > 0 ? activeProjects : org.projects;

  return (
    <div style={{ maxWidth: 920 }}>
      <div className="page-head" style={{ marginBottom: 18 }}>
        <div>
          <div className="crumb">
            <Link href="/hr/clients">Organizations</Link>
          </div>
          <h1>{org.name}</h1>
        </div>
      </div>

      {/* Navy-gradient header */}
      <div
        className="hero-navy"
        style={{ padding: "22px 24px", marginBottom: 20 }}
      >
        <div className="hero-orb" />
        <div style={{ display: "flex", alignItems: "center", gap: 16, position: "relative" }}>
          {monogram(org.name, 54)}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 4,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: "var(--text-xl)",
                  color: "#fff",
                }}
              >
                {org.name}
              </span>
              {statusBadge(org.status as OrgStatus)}
            </div>
            <div style={{ fontSize: "var(--text-sm)", color: "rgba(255,255,255,0.7)" }}>
              {planLine} · {org.slug}
              {org.notionId && ` · Notion: ${org.notionId}`}
            </div>
          </div>
        </div>
      </div>

      {/* 3 stat tiles */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
        {statTile("MRR", mrr)}
        {statTile("Projects", org._count.projects)}
        {statTile("Open requests", openReqs)}
      </div>

      {/* Profile summary: primary contact + account lead + assigned VAs + active projects */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 20,
          marginBottom: 32,
        }}
      >
        <div className="surface" style={{ padding: 18 }}>
          {sectionLabel("Primary contact")}
          <div style={{ fontSize: "var(--text-base)", fontWeight: 600, color: "var(--color-text-primary)" }}>
            {primaryContact}
          </div>

          <div style={{ marginTop: 18 }}>
            {sectionLabel("Account lead")}
            {lead ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar name={lead.name ?? lead.email} size={30} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-text-primary)" }}>
                    {lead.name ?? lead.email}
                  </div>
                  <div style={{ fontSize: "var(--text-2xs)", color: "var(--color-text-tertiary)" }}>
                    {lead.staffRole}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>No lead assigned yet</div>
            )}
          </div>
        </div>

        <div className="surface" style={{ padding: 18 }}>
          {sectionLabel("Assigned VAs")}
          {vas.length > 0 ? (
            <div>
              {vas.map((m) => (
                <div
                  key={m.userId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 0",
                    borderBottom: "1px solid var(--color-border-subtle)",
                  }}
                >
                  <Avatar name={m.name ?? m.email} size={30} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-text-primary)" }}>
                      {m.name ?? m.email}
                    </div>
                    <div style={{ fontSize: "var(--text-2xs)", color: "var(--color-text-tertiary)" }}>
                      {m.staffRole}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)", padding: "6px 0" }}>
              No VAs assigned yet
            </div>
          )}
        </div>

        <div className="surface" style={{ padding: 18 }}>
          {sectionLabel("Active projects")}
          {profileProjects.length > 0 ? (
            <div>
              {profileProjects.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 0",
                    borderBottom: "1px solid var(--color-border-subtle)",
                  }}
                >
                  <Link
                    href={`/hr/projects/${p.id}`}
                    style={{
                      fontSize: "var(--text-sm)",
                      fontWeight: 500,
                      color: "var(--color-text-primary)",
                      textDecoration: "none",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.name}
                  </Link>
                  <Badge variant={p.status === "Active" ? "sky" : "default"}>{p.status}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)", padding: "6px 0" }}>
              No active projects yet
            </div>
          )}
        </div>
      </section>

      {/* ── Existing functional sections (kept intact) ──────────────────────── */}
      <section style={{ marginBottom: 32 }}>
        <h3 className="sec-title" style={{ marginBottom: 4 }}>Assigned team</h3>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", margin: "0 0 12px", maxWidth: 560 }}>
          The internal staff working this client — a <strong>Lead</strong> (account manager / Team Lead) plus the VAs on
          the account. Assigned VAs are auto-suggested first when delegating this client&apos;s work, and this client
          shows up under their &ldquo;My clients&rdquo;.
        </p>
        <ClientTeamManager orgId={org.id} team={team} staff={staff} />
      </section>

      <section style={{ marginBottom: 32 }}>
        <div className="sec-head">
          <h3 className="sec-title">Members</h3>
          <form action={`/api/hr/clients/${org.slug}/members`} method="POST" style={{ display: "flex", gap: 8 }}>
            <input
              name="email"
              type="email"
              placeholder="email@example.com"
              required
              style={{ padding: "6px 12px", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: "var(--text-sm)" }}
            />
            <button type="submit" className="btn btn-primary">
              Add Member
            </button>
          </form>
        </div>
        {org.memberships.map((m) => (
          <div
            key={m.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "10px 0",
              borderBottom: "1px solid var(--color-border-subtle)",
            }}
          >
            <div>
              <div style={{ fontWeight: 500, fontSize: "var(--text-sm)" }}>{m.user.name ?? m.user.email}</div>
              <div style={{ fontSize: "var(--text-2xs)", color: "var(--color-text-secondary)" }}>
                {m.user.email} · {m.user.role}
              </div>
            </div>
          </div>
        ))}
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 className="sec-title" style={{ marginBottom: 12 }}>Projects</h3>
        {org.projects.map((p) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 0",
              borderBottom: "1px solid var(--color-border-subtle)",
            }}
          >
            <a href={`/hr/projects/${p.id}`} style={{ fontSize: "var(--text-sm)", textDecoration: "none", color: "inherit" }}>
              {p.name}
            </a>
            <Badge variant={p.status === "Active" ? "sky" : "default"}>{p.status}</Badge>
          </div>
        ))}
      </section>

      {betaVisible && (
        <section style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <h3 className="sec-title">Notion sync</h3>
            <span
              style={{
                fontSize: "var(--text-2xs)",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#fff",
                background: "var(--color-navy-900)",
                padding: "2px 6px",
                borderRadius: 5,
              }}
            >
              Beta
            </span>
          </div>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", margin: "0 0 12px", maxWidth: 560 }}>
            Connect this client&apos;s own Notion Projects/Tasks database. Status syncs both ways; everything else stays
            in Notion, reachable via the page link added to each item&apos;s description. Imported Notion pages are tagged
            as Notion items.
          </p>
          <details style={{ marginBottom: 16, maxWidth: 620 }}>
            <summary style={{ cursor: "pointer", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-sky-600)" }}>
              How it works / walk the client through setup
            </summary>
            <div style={{ marginTop: 12 }}>
              <NotionHelp audience="staff" oauth={oauthConfigured} />
            </div>
          </details>
          <NotionConnectForm
            orgId={org.id}
            orgSlug={org.slug}
            returnPath={`/hr/clients/${org.slug}`}
            oauthConfigured={oauthConfigured}
            needsPick={needsPick}
            state={{
              connected: fullyConnected,
              projectsDatabaseId: conn?.projectsDatabaseId ?? null,
              tasksDatabaseId: conn?.tasksDatabaseId ?? null,
              statusProperty: conn?.statusProperty ?? null,
              lastSyncedAt: conn?.lastSyncedAt ? conn.lastSyncedAt.toISOString() : null,
              lastSyncSummary: (conn?.lastSyncSummary as Record<string, number> | null) ?? null,
            }}
          />
        </section>
      )}
    </div>
  );
}

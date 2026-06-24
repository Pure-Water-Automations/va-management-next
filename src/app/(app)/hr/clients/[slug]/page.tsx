import { getCurrentUser, isBetaVisible } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { NotionConnectForm } from "@/components/NotionConnectForm";
import { NotionHelp } from "@/components/NotionHelp";

export default async function HrClientOrgPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (user.role !== "HR_MANAGER" && user.role !== "PEOPLE_OPS" && !user.isAdmin) {
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

  const betaVisible = await isBetaVisible(user.email);
  const conn = org.notionConnection;

  return (
    <div style={{ maxWidth: 800, padding: 24 }}>
      <Link href="/hr/clients" style={{ fontSize: 13, color: "var(--text-secondary)" }}>← Clients</Link>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: "12px 0 4px" }}>{org.name}</h1>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 24 }}>
        Status: {org.status} · Slug: {org.slug}
        {org.notionId && ` · Notion: ${org.notionId}`}
      </div>

      <section style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Members</h2>
          <form action={`/api/hr/clients/${org.slug}/members`} method="POST" style={{ display: "flex", gap: 8 }}>
            <input name="email" type="email" placeholder="email@example.com" required
              style={{ padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13 }} />
            <button type="submit"
              style={{ padding: "6px 14px", background: "var(--accent, #0066cc)", color: "#fff", border: "none", borderRadius: 6, fontSize: 13 }}>
              Add Member
            </button>
          </form>
        </div>
        {org.memberships.map((m) => (
          <div key={m.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>{m.user.name ?? m.user.email}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{m.user.email} · {m.user.role}</div>
            </div>
          </div>
        ))}
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Projects</h2>
        {org.projects.map((p) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
            <a href={`/hr/projects/${p.id}`} style={{ fontSize: 14, textDecoration: "none", color: "inherit" }}>{p.name}</a>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{p.status}</span>
          </div>
        ))}
      </section>

      {betaVisible && (
        <section style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>Notion sync</h2>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#fff", background: "var(--accent, #0066cc)", padding: "2px 6px", borderRadius: 5 }}>
              Beta
            </span>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 12px", maxWidth: 560 }}>
            Connect this client&apos;s own Notion Projects/Tasks database. Status syncs both ways; everything else stays
            in Notion, reachable via the page link added to each item&apos;s description. Imported Notion pages are tagged
            as Notion items.
          </p>
          <details style={{ marginBottom: 16, maxWidth: 620 }}>
            <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--accent, #0066cc)" }}>
              How it works / walk the client through setup
            </summary>
            <div style={{ marginTop: 12 }}>
              <NotionHelp audience="staff" />
            </div>
          </details>
          <NotionConnectForm
            orgId={org.id}
            orgSlug={org.slug}
            state={{
              connected: !!conn?.active,
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

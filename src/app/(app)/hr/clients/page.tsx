import { getCurrentUser } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getMyClientIds } from "@/lib/reads/team";

function pill(active: boolean): React.CSSProperties {
  return {
    padding: "5px 12px",
    borderRadius: 999,
    fontSize: 13,
    textDecoration: "none",
    border: "1px solid var(--border)",
    background: active ? "var(--accent, #0066cc)" : "transparent",
    color: active ? "#fff" : "var(--text-secondary)",
  };
}

export default async function HrClientsPage({ searchParams }: { searchParams: Promise<{ mine?: string }> }) {
  const user = await getCurrentUser();
  if (user.role !== "HR_MANAGER" && user.role !== "PEOPLE_OPS" && !user.isAdmin) {
    redirect("/hr");
  }
  const onlyMine = (await searchParams).mine === "1";

  const [allOrgs, myClientIds] = await Promise.all([
    db.clientOrganization.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        active: true,
        _count: { select: { assignments: true, projects: true } },
      },
      orderBy: { name: "asc" },
    }),
    getMyClientIds(user.id),
  ]);
  const orgs = onlyMine ? allOrgs.filter((o) => myClientIds.has(o.id)) : allOrgs;

  return (
    <div style={{ maxWidth: 900, padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Client Organizations</h1>
        <a
          href="/hr/clients/new"
          style={{ padding: "8px 16px", background: "var(--accent, #0066cc)", color: "#fff", borderRadius: 6, fontSize: 13, textDecoration: "none" }}
        >
          + New Organization
        </a>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 18 }}>
        <Link href="/hr/clients" style={pill(!onlyMine)}>All ({allOrgs.length})</Link>
        <Link href="/hr/clients?mine=1" style={pill(onlyMine)}>My clients ({myClientIds.size})</Link>
      </div>

      {orgs.length === 0 && (
        <p style={{ color: "var(--text-secondary)" }}>
          {onlyMine ? "You're not assigned to any clients yet." : "No client organizations yet."}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {orgs.map((org) => (
          <Link
            key={org.id}
            href={`/hr/clients/${org.slug}`}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16, border: "1px solid var(--border)", borderRadius: 8, textDecoration: "none", color: "inherit" }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>
                {myClientIds.has(org.id) && <span title="You're assigned to this client" style={{ marginRight: 6, color: "var(--accent, #0066cc)" }}>★</span>}
                {org.name}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                {org._count.assignments} assigned · {org._count.projects} project{org._count.projects !== 1 ? "s" : ""}
              </div>
            </div>
            <span
              style={{ fontSize: 12, padding: "2px 8px", borderRadius: 12, background: org.status === "active" ? "#d1fae5" : "#f3f4f6", color: org.status === "active" ? "#065f46" : "#6b7280" }}
            >
              {org.status}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

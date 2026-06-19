import { getCurrentUser } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function HrClientsPage() {
  const user = await getCurrentUser();
  if (user.role !== "HR_MANAGER" && user.role !== "PEOPLE_OPS" && !user.isAdmin) {
    redirect("/hr");
  }

  const orgs = await db.clientOrganization.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      active: true,
      _count: { select: { memberships: true, projects: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div style={{ maxWidth: 900, padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Client Organizations</h1>
        <a
          href="/hr/clients/new"
          style={{
            padding: "8px 16px",
            background: "var(--accent, #0066cc)",
            color: "#fff",
            borderRadius: 6,
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          + New Organization
        </a>
      </div>

      {orgs.length === 0 && <p style={{ color: "var(--text-secondary)" }}>No client organizations yet.</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {orgs.map((org) => (
          <Link
            key={org.id}
            href={`/hr/clients/${org.slug}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 16,
              border: "1px solid var(--border)",
              borderRadius: 8,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{org.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                {org._count.memberships} member{org._count.memberships !== 1 ? "s" : ""} ·{" "}
                {org._count.projects} project{org._count.projects !== 1 ? "s" : ""}
              </div>
            </div>
            <span
              style={{
                fontSize: 12,
                padding: "2px 8px",
                borderRadius: 12,
                background: org.status === "active" ? "#d1fae5" : "#f3f4f6",
                color: org.status === "active" ? "#065f46" : "#6b7280",
              }}
            >
              {org.status}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

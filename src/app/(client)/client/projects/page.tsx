import { getCurrentUser } from "@/lib/auth/access";
import { getClientMembership, assertClientRole } from "@/lib/auth/client";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function ClientProjectsPage() {
  const user = await getCurrentUser();
  assertClientRole(user);
  const membership = await getClientMembership(user.id);
  if (!membership) redirect("/client/no-access");

  const projects = await db.project.findMany({
    where: { clientOrganizationId: membership.clientOrganizationId },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      priority: true,
      dueDate: true,
      owner: { select: { name: true } },
      _count: { select: { tasks: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div style={{ maxWidth: 800 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 24 }}>Projects</h1>
      {projects.length === 0 && (
        <p style={{ color: "var(--text-secondary)" }}>No projects yet.</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/client/projects/${p.id}`}
            style={{
              display: "block",
              padding: 16,
              border: "1px solid var(--border)",
              borderRadius: 8,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{p.name}</div>
            {p.description && (
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
                {p.description}
              </div>
            )}
            <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", gap: 16 }}>
              <span>Status: {p.status}</span>
              <span>Tasks: {p._count.tasks}</span>
              {p.owner?.name && <span>Owner: {p.owner.name}</span>}
              {p.dueDate && <span>Due: {new Date(p.dueDate).toLocaleDateString()}</span>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

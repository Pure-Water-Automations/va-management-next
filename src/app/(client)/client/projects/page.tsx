import { getCurrentUser } from "@/lib/auth/access";
import { getClientMembership, assertClientRole } from "@/lib/auth/client";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/StatusPill";

const meta: React.CSSProperties = {
  fontSize: "var(--text-xs)",
  color: "var(--color-text-tertiary)",
};

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
    <div>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-2xl)",
          fontWeight: "var(--weight-bold)",
          color: "var(--color-text-primary)",
          letterSpacing: "var(--tracking-tight)",
          margin: "0 0 var(--space-6)",
        }}
      >
        Projects
      </h1>

      {projects.length === 0 && (
        <Card padding="var(--space-6)">
          <p style={{ margin: 0, color: "var(--color-text-tertiary)" }}>No projects yet.</p>
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {projects.map((p) => (
          <Link key={p.id} href={`/client/projects/${p.id}`} style={{ display: "block" }}>
            <Card padding="var(--space-5)" style={{ transition: "box-shadow var(--duration-base) var(--ease-out)" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "var(--space-3)",
                }}
              >
                <div style={{ fontWeight: "var(--weight-semibold)", fontSize: "var(--text-base)", color: "var(--color-text-primary)" }}>
                  {p.name}
                </div>
                <StatusPill status={p.status} />
              </div>
              {p.description && (
                <div
                  style={{
                    fontSize: "var(--text-sm)",
                    color: "var(--color-text-secondary)",
                    margin: "var(--space-2) 0",
                    lineHeight: "var(--leading-relaxed)",
                  }}
                >
                  {p.description}
                </div>
              )}
              <div style={{ display: "flex", gap: "var(--space-4)", marginTop: "var(--space-3)", flexWrap: "wrap" }}>
                <span style={meta}>{p._count.tasks} task{p._count.tasks === 1 ? "" : "s"}</span>
                {p.owner?.name && <span style={meta}>Owner: {p.owner.name}</span>}
                {p.dueDate && <span style={meta}>Due {new Date(p.dueDate).toLocaleDateString()}</span>}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

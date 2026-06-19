import { getCurrentUser } from "@/lib/auth/access";
import { getClientMembership, assertClientRole } from "@/lib/auth/client";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { StatusPill, PriorityPill } from "@/components/StatusPill";

const backLink: React.CSSProperties = {
  fontSize: "var(--text-sm)",
  color: "var(--color-text-tertiary)",
  fontWeight: "var(--weight-medium)",
};

export default async function ClientProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const user = await getCurrentUser();
  assertClientRole(user);
  const membership = await getClientMembership(user.id);
  if (!membership) redirect("/client/no-access");

  const project = await db.project.findFirst({
    where: { id: projectId, clientOrganizationId: membership.clientOrganizationId },
    select: {
      id: true,
      name: true,
      status: true,
      tasks: {
        where: { clientOrganizationId: membership.clientOrganizationId },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
          assignedTo: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!project) notFound();

  return (
    <div>
      <Link href="/client/projects" style={backLink}>
        ← Projects
      </Link>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          margin: "var(--space-3) 0 var(--space-6)",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-2xl)",
            fontWeight: "var(--weight-bold)",
            color: "var(--color-text-primary)",
            letterSpacing: "var(--tracking-tight)",
            margin: 0,
          }}
        >
          {project.name}
        </h1>
        <StatusPill status={project.status} size="md" />
      </div>

      {project.tasks.length === 0 && (
        <Card padding="var(--space-6)">
          <p style={{ margin: 0, color: "var(--color-text-tertiary)" }}>No visible tasks yet.</p>
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2-5)" }}>
        {project.tasks.map((t) => (
          <Card key={t.id} padding="var(--space-4)">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "var(--space-3)",
              }}
            >
              <div style={{ fontWeight: "var(--weight-medium)", color: "var(--color-text-primary)" }}>
                {t.title}
              </div>
              <div style={{ display: "flex", gap: "var(--space-1-5)", flexShrink: 0 }}>
                <PriorityPill priority={t.priority} />
                <StatusPill status={t.status} />
              </div>
            </div>
            {(t.assignedTo?.name || t.dueDate) && (
              <div
                style={{
                  display: "flex",
                  gap: "var(--space-4)",
                  marginTop: "var(--space-2)",
                  fontSize: "var(--text-xs)",
                  color: "var(--color-text-tertiary)",
                }}
              >
                {t.assignedTo?.name && <span>Assigned to {t.assignedTo.name}</span>}
                {t.dueDate && <span>Due {new Date(t.dueDate).toLocaleDateString()}</span>}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

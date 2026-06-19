import { getCurrentUser } from "@/lib/auth/access";
import { getClientMembership, assertClientRole } from "@/lib/auth/client";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";

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
    <div style={{ maxWidth: 800 }}>
      <a href="/client/projects" style={{ fontSize: 13, color: "var(--text-secondary)" }}>
        ← Projects
      </a>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: "12px 0 24px" }}>{project.name}</h1>
      {project.tasks.length === 0 && (
        <p style={{ color: "var(--text-secondary)" }}>No visible tasks yet.</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {project.tasks.map((t) => (
          <div
            key={t.id}
            style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 8 }}
          >
            <div style={{ fontWeight: 500, marginBottom: 4 }}>{t.title}</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", gap: 16 }}>
              <span>{t.status}</span>
              <span>{t.priority}</span>
              {t.assignedTo?.name && <span>Assigned to: {t.assignedTo.name}</span>}
              {t.dueDate && <span>Due: {new Date(t.dueDate).toLocaleDateString()}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

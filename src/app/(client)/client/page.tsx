import { getCurrentUser } from "@/lib/auth/access";
import { getClientMembership, assertClientRole } from "@/lib/auth/client";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

export default async function ClientDashboardPage() {
  const user = await getCurrentUser();
  assertClientRole(user);
  const membership = await getClientMembership(user.id);
  if (!membership) redirect("/client/no-access");

  const orgId = membership.clientOrganizationId;

  const [openRequestCount, activeProjectCount, recentComments] = await Promise.all([
    db.clientTaskRequest.count({
      where: {
        clientOrganizationId: orgId,
        status: { in: ["RECEIVED", "TRIAGE_NEEDED", "READY_TO_ASSIGN", "ASSIGNED"] },
      },
    }),
    db.project.count({
      where: { clientOrganizationId: orgId, status: { in: ["Planning", "Active"] } },
    }),
    db.taskComment.findMany({
      where: {
        visibility: "CLIENT_VISIBLE",
        task: { clientOrganizationId: orgId },
      },
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: { select: { name: true } },
        task: { select: { title: true, id: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  return (
    <div style={{ maxWidth: 800 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 24 }}>
        {membership.clientOrganization.name}
      </h1>
      <div style={{ display: "flex", gap: 24, marginBottom: 32 }}>
        <div style={{ padding: "16px 24px", border: "1px solid var(--border)", borderRadius: 8 }}>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{openRequestCount}</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Open Requests</div>
        </div>
        <div style={{ padding: "16px 24px", border: "1px solid var(--border)", borderRadius: 8 }}>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{activeProjectCount}</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Active Projects</div>
        </div>
      </div>

      {recentComments.length > 0 && (
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Recent Updates</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recentComments.map((c) => (
              <div
                key={c.id}
                style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 6 }}
              >
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                  {c.author.name} on <strong>{c.task.title}</strong> ·{" "}
                  {new Date(c.createdAt).toLocaleDateString()}
                </div>
                <div style={{ fontSize: 14 }}>{c.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

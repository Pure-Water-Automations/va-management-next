import { getCurrentUser } from "@/lib/auth/access";
import { getClientMembership, assertClientRole } from "@/lib/auth/client";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Stat } from "@/components/ui/Stat";
import { Card } from "@/components/ui/Card";

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
        {membership.clientOrganization.name}
      </h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "var(--space-4)",
          marginBottom: "var(--space-8)",
        }}
      >
        <Stat label="Open requests" value={openRequestCount} />
        <Stat label="Active projects" value={activeProjectCount} variant="sky" />
      </div>

      {recentComments.length > 0 && (
        <section>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-lg)",
              fontWeight: "var(--weight-semibold)",
              color: "var(--color-text-primary)",
              margin: "0 0 var(--space-3)",
            }}
          >
            Recent updates
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {recentComments.map((c) => (
              <Card key={c.id} padding="var(--space-4)">
                <div
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-tertiary)",
                    marginBottom: "var(--space-1)",
                  }}
                >
                  {c.author.name} on{" "}
                  <strong style={{ color: "var(--color-text-secondary)" }}>{c.task.title}</strong> ·{" "}
                  {new Date(c.createdAt).toLocaleDateString()}
                </div>
                <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)", lineHeight: "var(--leading-relaxed)" }}>
                  {c.body}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

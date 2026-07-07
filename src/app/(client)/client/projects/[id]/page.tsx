import { getCurrentUser } from "@/lib/auth/access";
import { getClientMembership, assertClientRole } from "@/lib/auth/client";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { StatusPill, PriorityPill } from "@/components/StatusPill";
import { ReadOnlyBlocks } from "@/components/hub/ReadOnlyBlocks";
import { ClientCommentForm } from "@/components/client/ClientCommentForm";
import { parseStoredBlocks } from "@/lib/services/blocks";

const backLink: React.CSSProperties = {
  fontSize: "var(--text-sm)",
  color: "var(--color-text-tertiary)",
  fontWeight: "var(--weight-medium)",
};

const sectionTitle: React.CSSProperties = {
  fontSize: "var(--text-sm)",
  fontWeight: 600,
  color: "var(--color-text-primary)",
  margin: "0 0 var(--space-3)",
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

  // OS Hub projections — everything below is live data the team curates:
  // shared fields (clientVisible), the hub Overview page (clientVisible),
  // published Library docs, and the CLIENT_VISIBLE comment thread.
  const [sharedFields, overviewPage, sharedDocs, comments] = await Promise.all([
    db.fieldDef.findMany({
      where: { clientVisible: true, OR: [{ projectId }, { projectId: null }] },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: { values: { where: { projectId } } },
    }),
    db.page.findFirst({
      where: { projectId, scope: "PROJECT", clientVisible: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    db.page.findMany({
      where: { scope: "LIBRARY", published: true },
      orderBy: { title: "asc" },
      select: { id: true, title: true, updatedAt: true },
    }),
    db.projectComment.findMany({
      where: { projectId, visibility: "CLIENT_VISIBLE" },
      orderBy: { createdAt: "asc" },
      select: { id: true, body: true, createdAt: true, author: { select: { name: true } } },
    }),
  ]);

  const done = project.tasks.filter((t) => t.status === "Done").length;
  const pct = project.tasks.length ? Math.round((done / project.tasks.length) * 100) : 0;

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
          margin: "var(--space-3) 0 var(--space-4)",
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

      {/* Progress */}
      <div style={{ marginBottom: "var(--space-4)" }}>
        <div style={{ height: 6, borderRadius: 4, background: "var(--color-neutral-100, #f0f0f2)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "var(--color-sky-500, #2eb4dd)", borderRadius: 4 }} />
        </div>
        <div style={{ marginTop: 4, fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
          {done} of {project.tasks.length} visible tasks done
        </div>
      </div>

      {/* Shared fields */}
      {sharedFields.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: "var(--space-5)" }}>
          {sharedFields.map((f) => (
            <span
              key={f.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                height: 28,
                padding: "0 12px",
                borderRadius: 999,
                border: "1px solid var(--color-border-subtle, #e8e8ed)",
                background: "var(--color-surface, #fff)",
                fontSize: "var(--text-xs)",
              }}
            >
              <span style={{ color: "var(--color-text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>
                {f.name}
              </span>
              {f.values[0]?.value ?? "—"}
            </span>
          ))}
          <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
            fields your team chose to share
          </span>
        </div>
      )}

      {/* Overview (live hub page) */}
      {overviewPage && (
        <Card padding="var(--space-6)" style={{ marginBottom: "var(--space-5)" }}>
          <h2 style={sectionTitle}>
            Overview{" "}
            <span style={{ fontWeight: 400, color: "var(--color-text-tertiary)" }}>
              · from your team&apos;s project hub · always current
            </span>
          </h2>
          <ReadOnlyBlocks blocks={parseStoredBlocks(overviewPage.blocks)} />
        </Card>
      )}

      {/* Tasks */}
      <h2 style={sectionTitle}>Tasks</h2>
      {project.tasks.length === 0 && (
        <Card padding="var(--space-6)">
          <p style={{ margin: 0, color: "var(--color-text-tertiary)" }}>No visible tasks yet.</p>
        </Card>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2-5)", marginBottom: "var(--space-5)" }}>
        {project.tasks.map((t) => (
          <Card key={t.id} padding="var(--space-4)">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-3)" }}>
              <div style={{ fontWeight: "var(--weight-medium)", color: "var(--color-text-primary)" }}>{t.title}</div>
              <div style={{ display: "flex", gap: "var(--space-1-5)", flexShrink: 0 }}>
                <PriorityPill priority={t.priority} />
                <StatusPill status={t.status} />
              </div>
            </div>
            {(t.assignedTo?.name || t.dueDate) && (
              <div style={{ display: "flex", gap: "var(--space-4)", marginTop: "var(--space-2)", fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
                {t.assignedTo?.name && <span>Assigned to {t.assignedTo.name}</span>}
                {t.dueDate && <span>Due {new Date(t.dueDate).toLocaleDateString()}</span>}
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Shared docs */}
      {sharedDocs.length > 0 && (
        <>
          <h2 style={sectionTitle}>Shared with you</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginBottom: "var(--space-5)" }}>
            {sharedDocs.map((d) => (
              <Link
                key={d.id}
                href={`/client/docs/${d.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid var(--color-border-subtle, #e8e8ed)",
                  background: "var(--color-surface, #fff)",
                  fontSize: "var(--text-sm)",
                  fontWeight: 500,
                  textDecoration: "none",
                  color: "var(--color-text-primary)",
                }}
              >
                📄 {d.title}
                <span style={{ marginLeft: "auto", fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
                  read-only · always current
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Requests pointer */}
      <Card padding="var(--space-4)" style={{ marginBottom: "var(--space-5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
            Need something? Requests land directly in the team&apos;s project workspace.
          </span>
          <Link
            href="/client/requests"
            style={{ marginLeft: "auto", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-sky-700, #177a9c)", textDecoration: "none" }}
          >
            Request work →
          </Link>
        </div>
      </Card>

      {/* Comments */}
      <h2 style={sectionTitle}>Comments</h2>
      <Card padding="var(--space-4)">
        {comments.length === 0 && (
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>
            No comments yet — start the thread below.
          </p>
        )}
        {comments.map((c) => (
          <div key={c.id} style={{ padding: "8px 0", borderBottom: "1px dashed var(--color-border-subtle, #e8e8ed)" }}>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginBottom: 2 }}>
              {c.author.name ?? "Team"} · {c.createdAt.toLocaleDateString()}
            </div>
            <div style={{ fontSize: "var(--text-sm)" }}>{c.body}</div>
          </div>
        ))}
        <ClientCommentForm projectId={project.id} />
      </Card>
    </div>
  );
}

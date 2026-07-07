import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/access";
import { canManageProjects } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { StatusPill, PriorityPill } from "@/components/StatusPill";
import { ReadOnlyBlocks } from "@/components/hub/ReadOnlyBlocks";
import { parseStoredBlocks } from "@/lib/services/blocks";

export const dynamic = "force-dynamic";

/**
 * "View as client" (design topbar button): a READ-ONLY, manager-gated render
 * of exactly what the client portal shows for this project — same queries,
 * same visibility filters, no forms. Not an impersonation: no client session
 * is created and nothing can be submitted from here.
 */
export default async function ClientPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user.isAdmin && !canManageProjects(user.role)) redirect(`/hr/projects/${id}`);

  const project = await db.project.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      status: true,
      clientOrganizationId: true,
      clientOrganization: { select: { name: true } },
      tasks: {
        // Portal filter: only tasks scoped to the client org are visible.
        where: { clientOrganizationId: { not: null } },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
          clientOrganizationId: true,
          assignedTo: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!project) notFound();
  if (!project.clientOrganizationId) {
    return (
      <p style={{ padding: 32 }}>
        This project isn&apos;t linked to a client organization — there is no portal view to preview.{" "}
        <Link href={`/hr/projects/${id}`}>← Back</Link>
      </p>
    );
  }

  const orgTasks = project.tasks.filter((t) => t.clientOrganizationId === project.clientOrganizationId);

  const [sharedFields, overviewPage, sharedDocs, comments] = await Promise.all([
    db.fieldDef.findMany({
      where: { clientVisible: true, OR: [{ projectId: id }, { projectId: null }] },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: { values: { where: { projectId: id } } },
    }),
    db.page.findFirst({
      where: { projectId: id, scope: "PROJECT", clientVisible: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    db.page.findMany({
      where: { scope: "LIBRARY", published: true },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
    db.projectComment.findMany({
      where: { projectId: id, visibility: "CLIENT_VISIBLE" },
      orderBy: { createdAt: "asc" },
      select: { id: true, body: true, createdAt: true, author: { select: { name: true } } },
    }),
  ]);

  const done = orgTasks.filter((t) => t.status === "Done").length;
  const pct = orgTasks.length ? Math.round((done / orgTasks.length) * 100) : 0;

  return (
    <div style={{ maxWidth: 920 }}>
      {/* Preview banner */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          padding: "10px 16px",
          marginBottom: 20,
          borderRadius: 14,
          border: "1px solid var(--color-sky-100, #c9edf8)",
          background: "var(--color-sky-50, #f0fafd)",
          fontSize: "var(--text-sm)",
          color: "var(--color-sky-700, #177a9c)",
          fontWeight: 600,
        }}
      >
        👁 Previewing “{project.name}” as {project.clientOrganization?.name ?? "the client"} — read-only,
        exactly the portal&apos;s visibility rules.
        <Link href={`/hr/projects/${id}`} style={{ marginLeft: "auto", color: "inherit" }}>
          ← Back to console
        </Link>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: "var(--text-2xl)" }}>{project.name}</h1>
        <StatusPill status={project.status} size="md" />
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ height: 6, borderRadius: 4, background: "var(--color-neutral-100, #f0f0f2)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "var(--color-sky-500, #2eb4dd)", borderRadius: 4 }} />
        </div>
        <div style={{ marginTop: 4, fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
          {done} of {orgTasks.length} visible tasks done
        </div>
      </div>

      {sharedFields.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
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
                border: "1px solid var(--color-border-subtle)",
                background: "var(--color-surface)",
                fontSize: "var(--text-xs)",
              }}
            >
              <span style={{ color: "var(--color-text-tertiary)", fontWeight: 600, textTransform: "uppercase" }}>{f.name}</span>
              {f.values[0]?.value ?? "—"}
            </span>
          ))}
          <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>fields your team chose to share</span>
        </div>
      )}

      {overviewPage ? (
        <Card padding={20} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: 8 }}>
            Overview <span style={{ fontWeight: 400, color: "var(--color-text-tertiary)" }}>· live from the hub</span>
          </div>
          <ReadOnlyBlocks blocks={parseStoredBlocks(overviewPage.blocks)} />
        </Card>
      ) : (
        <Card padding={20} style={{ marginBottom: 18 }}>
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>
            No Overview shared yet — flip a hub page to “Client-visible” and it appears here.
          </p>
        </Card>
      )}

      <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: 8 }}>Tasks</div>
      {orgTasks.length === 0 && (
        <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>
          No client-visible tasks (tasks must be scoped to the client organization).
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
        {orgTasks.map((t) => (
          <Card key={t.id} padding={14}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontWeight: 500 }}>{t.title}</span>
              <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <PriorityPill priority={t.priority} />
                <StatusPill status={t.status} />
              </span>
            </div>
          </Card>
        ))}
      </div>

      {sharedDocs.length > 0 && (
        <>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: 8 }}>Shared with you</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
            {sharedDocs.map((d) => (
              <div key={d.id} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid var(--color-border-subtle)", fontSize: "var(--text-sm)" }}>
                📄 {d.title}
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: 8 }}>Comments (client-visible)</div>
      <Card padding={14}>
        {comments.length === 0 && (
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>No client-visible comments.</p>
        )}
        {comments.map((c) => (
          <div key={c.id} style={{ padding: "6px 0", borderBottom: "1px dashed var(--color-border-subtle)", fontSize: "var(--text-sm)" }}>
            <span style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-xs)" }}>
              {c.author.name ?? "Team"} · {c.createdAt.toLocaleDateString()}:
            </span>{" "}
            {c.body}
          </div>
        ))}
      </Card>
    </div>
  );
}

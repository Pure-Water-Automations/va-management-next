import { getCurrentUser } from "@/lib/auth/access";
import { getClientMembership, assertClientRole } from "@/lib/auth/client";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/ui/task-format";
import { IconCalendar, IconFolder } from "@/components/icons";

export const dynamic = "force-dynamic";

// Flat list of every task the client's team is working on for them — including
// tasks imported from Notion that aren't (yet) linked to a project. The project
// detail page only shows tasks nested under a project, so imported tasks with no
// projectId were invisible to clients; this view surfaces all of them.
export default async function ClientTasksPage() {
  const user = await getCurrentUser();
  assertClientRole(user);
  const membership = await getClientMembership(user.id);
  if (!membership) redirect("/client/no-access");

  const tasks = await db.task.findMany({
    where: { clientOrganizationId: membership.clientOrganizationId },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      notionUrl: true,
      assignedTo: { select: { name: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="dash-stage">
      <h1 style={{ margin: "0 0 6px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-3xl)", letterSpacing: "-.03em", color: "var(--color-navy-900)" }}>
        Tasks
      </h1>
      <p style={{ margin: "0 0 22px", fontSize: "var(--text-base)", color: "var(--color-text-secondary)" }}>
        Every task your team is working on for you, across all projects.
      </p>

      {tasks.length === 0 ? (
        <div className="surface" style={{ padding: "44px 24px", textAlign: "center", color: "var(--color-text-tertiary)" }}>
          <div style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--color-text-secondary)" }}>No tasks yet</div>
          <div className="small" style={{ marginTop: 4 }}>When your team starts work for you, tasks will appear here.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {tasks.map((t) => (
            <div key={t.id} className="surface" style={{ padding: "16px 20px", borderRadius: "var(--radius-card)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ marginBottom: 6, lineHeight: 1.3 }}>
                    <span style={{ fontWeight: 600, fontSize: "var(--text-base)", color: "var(--color-navy-900)", verticalAlign: "middle", marginRight: 10 }}>{t.title}</span>
                    <span style={{ verticalAlign: "middle", display: "inline-flex" }}><StatusBadge value={t.status} kind="task" /></span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
                    {t.project ? (
                      <Link href={`/client/projects/${t.project.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--color-text-secondary)", fontWeight: 600 }}>
                        <IconFolder size={13} /> {t.project.name}
                      </Link>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <IconFolder size={13} /> No project
                      </span>
                    )}
                    {t.dueDate && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <IconCalendar size={13} /> Due {new Date(t.dueDate).toLocaleDateString()}
                      </span>
                    )}
                    {t.notionUrl && (
                      <a href={t.notionUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-sky-500)", fontWeight: 600 }}>
                        🔗 Notion
                      </a>
                    )}
                  </div>
                </div>
                {t.assignedTo?.name && (
                  <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8 }}>
                    <Avatar name={t.assignedTo.name} size={26} />
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontSize: "var(--text-2xs)", color: "var(--color-text-tertiary)" }}>Assigned</div>
                      <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1, whiteSpace: "nowrap" }}>{t.assignedTo.name}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

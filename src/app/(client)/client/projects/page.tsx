import { getCurrentUser } from "@/lib/auth/access";
import { getClientMembership, assertClientRole } from "@/lib/auth/client";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/ui/task-format";
import { IconChevronRight, IconCalendar } from "@/components/icons";

export const dynamic = "force-dynamic";

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
      dueDate: true,
      owner: { select: { name: true } },
      tasks: { select: { status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="dash-stage">
      <h1 style={{ margin: "0 0 6px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-3xl)", letterSpacing: "-.03em", color: "var(--color-navy-900)" }}>
        Projects
      </h1>
      <p style={{ margin: "0 0 22px", fontSize: "var(--text-base)", color: "var(--color-text-secondary)" }}>
        Bigger pieces of work your team is building for you. Tap any project to see what&apos;s inside.
      </p>

      {projects.length === 0 ? (
        <div className="surface" style={{ padding: "44px 24px", textAlign: "center", color: "var(--color-text-tertiary)" }}>
          <div style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--color-text-secondary)" }}>No projects yet</div>
          <div className="small" style={{ marginTop: 4 }}>When your team starts a project for you, it&apos;ll appear here.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {projects.map((p) => {
            const total = p.tasks.length;
            const done = p.tasks.filter((t) => t.status === "Done").length;
            const pct = total ? Math.round((done / total) * 100) : 0;
            return (
              <Link key={p.id} href={`/client/projects/${p.id}`} className="surface" style={{ display: "block", padding: "22px 24px", borderRadius: "var(--radius-card)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ marginBottom: 8, lineHeight: 1.3 }}>
                      <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-lg)", color: "var(--color-navy-900)", letterSpacing: "-.01em", verticalAlign: "middle", marginRight: 10 }}>{p.name}</span>
                      <span style={{ verticalAlign: "middle", display: "inline-flex" }}><StatusBadge value={p.status} kind="project" /></span>
                    </div>
                    {p.description && (
                      <p style={{ margin: "0 0 16px", fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", lineHeight: 1.55, maxWidth: "60ch" }}>{p.description}</p>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ flex: 1, maxWidth: 280 }}>
                        <div style={{ height: 7, borderRadius: 999, background: "var(--color-bg-tertiary)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, borderRadius: 999, background: "linear-gradient(90deg, var(--color-sky-400), var(--color-sky-500))" }} />
                        </div>
                      </div>
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", fontWeight: 600, whiteSpace: "nowrap" }}>{done}/{total} tasks done</span>
                    </div>
                  </div>
                  <div style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 9 }}>
                    {p.owner?.name && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Avatar name={p.owner.name} size={28} />
                        <div style={{ textAlign: "left" }}>
                          <div style={{ fontSize: "var(--text-2xs)", color: "var(--color-text-tertiary)" }}>Lead</div>
                          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1, whiteSpace: "nowrap" }}>{p.owner.name}</div>
                        </div>
                      </div>
                    )}
                    {p.dueDate && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", whiteSpace: "nowrap" }}>
                        <IconCalendar size={13} /> Due {new Date(p.dueDate).toLocaleDateString()}
                      </div>
                    )}
                    <span style={{ color: "var(--color-text-tertiary)" }}><IconChevronRight size={16} /></span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

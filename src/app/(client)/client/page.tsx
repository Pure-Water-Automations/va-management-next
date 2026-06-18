import { getCurrentUser } from "@/lib/auth/access";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { clientPortalRoutes } from "@/lib/client-portal/routes";

export const dynamic = "force-dynamic";

function canPreviewClientPortal(role: string, isAdmin: boolean): boolean {
  return isAdmin || role === "HR_MANAGER" || role === "PEOPLE_OPS" || role === "TEAM_LEAD";
}

export default async function ClientPortalPreviewPage() {
  const user = await getCurrentUser();

  if (!canPreviewClientPortal(user.role, user.isAdmin)) {
    return (
      <p style={{ padding: 32 }}>
        Client portal access is not enabled for this account yet.
      </p>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Client Portal Preview</div>
          <h1>Client Dashboard</h1>
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
            Preview scaffold for the external client experience. This route now uses a separate client shell instead of the internal HR/VA app shell.
          </p>
        </div>
        <a href={clientPortalRoutes.newTask} className="btn btn-primary" style={{ alignSelf: "center" }}>
          Delegate a Task
        </a>
      </div>

      <div className="stat-grid">
        <Stat label="Active projects" value={0} />
        <Stat label="Open tasks" value={0} />
        <Stat label="Waiting on client" value={0} />
        <Stat label="Completed this week" value={0} />
      </div>

      <div className="dash-grid" style={{ marginTop: 24 }}>
        <Card padding={20}>
          <h2 style={{ marginTop: 0 }}>What clients see first</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <PreviewRow title="Waiting on us" text="Tasks the VA team is actively handling or needs to triage." />
            <PreviewRow title="Waiting on you" text="Questions, approvals, missing files, or review requests." />
            <PreviewRow title="Recent deliverables" text="Final links/files clients can quickly find without digging through comments." />
            <PreviewRow title="Upcoming due dates" text="Client-safe calendar summary of promised work." />
          </div>
        </Card>

        <Card padding={20}>
          <h2 style={{ marginTop: 0 }}>Portal areas</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <a href={clientPortalRoutes.projects}>Projects</a>
            <a href={clientPortalRoutes.newTask}>Delegate a new task</a>
            <a href={clientPortalRoutes.files}>Files and deliverables</a>
            <a href={clientPortalRoutes.reports}>Reports</a>
          </div>
        </Card>
      </div>
    </>
  );
}

function PreviewRow({ title, text }: { title: string; text: string }) {
  return (
    <div style={{ paddingBottom: 10, borderBottom: "1px solid var(--color-border-subtle)" }}>
      <div style={{ fontWeight: 700 }}>{title}</div>
      <div className="small" style={{ color: "var(--color-text-secondary)", marginTop: 2 }}>
        {text}
      </div>
    </div>
  );
}

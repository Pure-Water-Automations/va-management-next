import { getCurrentUser } from "@/lib/auth/access";
import { Card } from "@/components/ui/Card";
import { clientPortalRoutes } from "@/lib/client-portal/routes";

export const dynamic = "force-dynamic";

function canPreviewClientPortal(role: string, isAdmin: boolean): boolean {
  return isAdmin || role === "HR_MANAGER" || role === "PEOPLE_OPS" || role === "TEAM_LEAD";
}

export default async function ClientProjectsPreviewPage() {
  const user = await getCurrentUser();

  if (!canPreviewClientPortal(user.role, user.isAdmin)) {
    return <p style={{ padding: 32 }}>Client portal access is not enabled for this account yet.</p>;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            <a href={clientPortalRoutes.home}>Client Portal</a> / Projects
          </div>
          <h1>Client Projects</h1>
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
            Placeholder route for a client-safe project list. The production version should call a tenant-scoped read model, not the HR project list.
          </p>
        </div>
      </div>

      <Card padding={20}>
        <h2 style={{ marginTop: 0 }}>Production read model</h2>
        <p style={{ color: "var(--color-text-secondary)" }}>
          Implement <code>getClientPortalProjects(clientOrganizationId)</code> after ClientOrganization and ClientMembership are migrated.
        </p>
        <ul style={{ marginBottom: 0 }}>
          <li>Return only projects for the active client organization.</li>
          <li>Show progress, next due date, open task count, and latest client-visible update.</li>
          <li>Hide internal notes, HR data, payroll data, and internal-only comments.</li>
        </ul>
      </Card>
    </>
  );
}

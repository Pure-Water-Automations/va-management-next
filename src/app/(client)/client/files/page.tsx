import { getCurrentUser } from "@/lib/auth/access";
import { Card } from "@/components/ui/Card";
import { clientPortalRoutes } from "@/lib/client-portal/routes";

export const dynamic = "force-dynamic";

function canPreviewClientPortal(role: string, isAdmin: boolean): boolean {
  return isAdmin || role === "HR_MANAGER" || role === "PEOPLE_OPS" || role === "TEAM_LEAD";
}

export default async function ClientFilesPreviewPage() {
  const user = await getCurrentUser();

  if (!canPreviewClientPortal(user.role, user.isAdmin)) {
    return <p style={{ padding: 32 }}>Client portal access is not enabled for this account yet.</p>;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            <a href={clientPortalRoutes.home}>Client Portal</a> / Files
          </div>
          <h1>Files & Deliverables</h1>
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
            Placeholder for client-visible links, attachments, drafts, and final deliverables.
          </p>
        </div>
      </div>

      <Card padding={20}>
        <h2 style={{ marginTop: 0 }}>Production behavior</h2>
        <ul style={{ marginBottom: 0 }}>
          <li>Show only client-visible files for the active client organization.</li>
          <li>Group by project, task, status, and type: source material, draft, final deliverable, reference.</li>
          <li>Support approval and revision requests on deliverables.</li>
          <li>Start with link attachments; add R2/Drive upload in the next phase.</li>
        </ul>
      </Card>
    </>
  );
}

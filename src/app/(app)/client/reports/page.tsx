import { getCurrentUser } from "@/lib/auth/access";
import { Card } from "@/components/ui/Card";
import { clientPortalRoutes } from "@/lib/client-portal/routes";

export const dynamic = "force-dynamic";

function canPreviewClientPortal(role: string, isAdmin: boolean): boolean {
  return isAdmin || role === "HR_MANAGER" || role === "PEOPLE_OPS" || role === "TEAM_LEAD";
}

export default async function ClientReportsPreviewPage() {
  const user = await getCurrentUser();

  if (!canPreviewClientPortal(user.role, user.isAdmin)) {
    return <p style={{ padding: 32 }}>Client portal access is not enabled for this account yet.</p>;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            <a href={clientPortalRoutes.home}>Client Portal</a> / Reports
          </div>
          <h1>Progress Reports</h1>
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
            Placeholder for client-safe weekly and monthly summaries.
          </p>
        </div>
      </div>

      <div className="dash-grid">
        <Card padding={20}>
          <h2 style={{ marginTop: 0 }}>Weekly report sections</h2>
          <ul style={{ marginBottom: 0 }}>
            <li>Completed this week.</li>
            <li>In progress.</li>
            <li>Waiting on client.</li>
            <li>Blocked or delayed.</li>
            <li>Recommended next delegations.</li>
          </ul>
        </Card>

        <Card padding={20}>
          <h2 style={{ marginTop: 0 }}>Internal safety rules</h2>
          <ul style={{ marginBottom: 0 }}>
            <li>Never include internal-only comments.</li>
            <li>Never include HR, payroll, or compensation data.</li>
            <li>Only show hours if the package explicitly includes client-visible hour reporting.</li>
            <li>Require Team Leader review before email-send automation.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}

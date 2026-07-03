import { getCurrentUser } from "@/lib/auth/access";
import { isGateReviewer } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import RequestsBoard, { type RequestRow } from "@/components/RequestsBoard";

export const dynamic = "force-dynamic";

export default async function HrRequestsPage() {
  const user = await getCurrentUser();
  if (!isGateReviewer(user.role) && !user.isAdmin) {
    return <p style={{ padding: 32 }}>Not authorized.</p>;
  }

  const requests = await db.clientTaskRequest.findMany({
    select: {
      id: true,
      title: true,
      description: true,
      priorityPreference: true,
      dueDatePreference: true,
      createdAt: true,
      status: true,
      declineReason: true,
      submittedBy: { select: { name: true, email: true } },
      clientOrganization: { select: { name: true } },
      assignedTask: { select: { id: true, title: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const rows: RequestRow[] = requests.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    priorityPreference: r.priorityPreference,
    dueDatePreference: r.dueDatePreference ? r.dueDatePreference.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    status: r.status as RequestRow["status"],
    declineReason: r.declineReason,
    submittedBy: r.submittedBy,
    clientOrganization: r.clientOrganization,
    assignedTask: r.assignedTask,
  }));

  return (
    <div className="dash-stage">
      <div className="page-head">
        <div>
          <div className="crumb">HR Operations</div>
          <h1>Client requests</h1>
        </div>
      </div>

      <p style={{ margin: "0 0 22px", fontSize: "var(--text-base)", color: "var(--color-text-secondary)" }}>
        Incoming asks from clients. Triage each one and assign it to the right VA.
      </p>

      <RequestsBoard requests={rows} />
    </div>
  );
}

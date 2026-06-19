import { getCurrentUser } from "@/lib/auth/access";
import { isGateReviewer } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default async function HrRequestsPage() {
  const user = await getCurrentUser();
  if (!isGateReviewer(user.role) && !user.isAdmin) {
    return <p style={{ padding: 32 }}>Not authorized.</p>;
  }

  const requests = await db.clientTaskRequest.findMany({
    where: { status: "PENDING" },
    select: {
      id: true,
      title: true,
      priorityPreference: true,
      dueDatePreference: true,
      createdAt: true,
      submittedBy: { select: { name: true, email: true } },
      clientOrganization: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">HR Operations</div>
          <h1>Client Request Triage</h1>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        {requests.length === 0 ? (
          <Card padding={24}>
            <p style={{ color: "var(--color-text-tertiary)", fontStyle: "italic", margin: 0 }}>
              No pending requests.
            </p>
          </Card>
        ) : (
          <Card padding={0} style={{ overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--color-bg-secondary)", borderBottom: "1px solid var(--color-border)" }}>
                  <th style={th}>Client Org</th>
                  <th style={th}>Submitter</th>
                  <th style={th}>Title</th>
                  <th style={th}>Priority</th>
                  <th style={th}>Due Pref.</th>
                  <th style={th}>Received</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r, i) => (
                  <tr
                    key={r.id}
                    style={{
                      borderBottom: i < requests.length - 1 ? "1px solid var(--color-border-subtle)" : undefined,
                    }}
                  >
                    <td style={td}>{r.clientOrganization.name}</td>
                    <td style={td}>
                      <span className="small">{r.submittedBy.name ?? r.submittedBy.email}</span>
                    </td>
                    <td style={{ ...td, fontWeight: 500 }}>{r.title}</td>
                    <td style={td}>
                      <span style={priorityStyle(r.priorityPreference)}>{r.priorityPreference}</span>
                    </td>
                    <td style={td} className="small">
                      {r.dueDatePreference ? r.dueDatePreference.toLocaleDateString() : "—"}
                    </td>
                    <td style={td} className="small">
                      {r.createdAt.toLocaleDateString()}
                    </td>
                    <td style={td}>
                      <a href={`/hr/requests/${r.id}`} className="btn btn-sm">
                        Review →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 16px",
  fontSize: "var(--text-sm)",
  fontWeight: 600,
  color: "var(--color-text-secondary)",
};

const td: React.CSSProperties = {
  padding: "14px 16px",
  fontSize: "var(--text-sm)",
  verticalAlign: "middle",
};

function priorityStyle(p: string): React.CSSProperties {
  const color =
    p === "High"
      ? "var(--color-error)"
      : p === "Low"
        ? "var(--color-text-tertiary)"
        : "var(--color-warning)";
  return { color, fontWeight: 500, fontSize: "var(--text-sm)" };
}

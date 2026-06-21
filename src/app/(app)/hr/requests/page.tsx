import { getCurrentUser } from "@/lib/auth/access";
import { isGateReviewer } from "@/lib/auth/roles";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function relAge(d: Date): string {
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function priorityChip(p: string) {
  const map: Record<string, { bg: string; fg: string }> = {
    High: { bg: "var(--color-error-light)", fg: "var(--color-error-dark)" },
    Medium: { bg: "var(--color-warning-light)", fg: "var(--color-warning-dark)" },
    Low: { bg: "var(--color-neutral-100)", fg: "var(--color-text-secondary)" },
  };
  const c = map[p] ?? map.Medium;
  return (
    <span style={{ fontSize: "var(--text-2xs)", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: c.fg, background: c.bg, padding: "2px 8px", borderRadius: 999 }}>
      {p}
    </span>
  );
}

export default async function HrRequestsPage() {
  const user = await getCurrentUser();
  if (!isGateReviewer(user.role) && !user.isAdmin) {
    return <p style={{ padding: 32 }}>Not authorized.</p>;
  }

  const requests = await db.clientTaskRequest.findMany({
    where: { status: { in: ["RECEIVED", "TRIAGE_NEEDED"] } },
    select: {
      id: true,
      title: true,
      description: true,
      priorityPreference: true,
      dueDatePreference: true,
      createdAt: true,
      submittedBy: { select: { name: true, email: true } },
      clientOrganization: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="dash-stage">
      <div className="page-head">
        <div>
          <div className="crumb">HR Operations</div>
          <h1>Client requests</h1>
        </div>
        <span className="small" style={{ color: "var(--color-text-tertiary)" }}>{requests.length} to triage</span>
      </div>

      <p style={{ margin: "0 0 20px", fontSize: "var(--text-base)", color: "var(--color-text-secondary)" }}>
        Incoming asks from clients. Triage each one and assign it to the right VA.
      </p>

      {requests.length === 0 ? (
        <div className="surface" style={{ padding: "44px 24px", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: "var(--text-sm)" }}>
          No incoming requests — inbox zero.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {requests.map((r) => (
            <div key={r.id} className="surface" style={{ padding: "18px 20px", borderRadius: "var(--radius-lg)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
                    <span style={{ fontSize: "var(--text-2xs)", fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--color-sky-700)" }}>{r.clientOrganization.name}</span>
                    {priorityChip(r.priorityPreference)}
                  </div>
                  <div style={{ fontSize: "var(--text-base)", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>{r.title}</div>
                  {r.description && (
                    <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", lineHeight: 1.5, maxWidth: "64ch" }}>{r.description}</p>
                  )}
                  <div style={{ fontSize: "var(--text-2xs)", color: "var(--color-text-tertiary)", marginTop: 8 }}>
                    From {r.submittedBy.name ?? r.submittedBy.email} · submitted {relAge(r.createdAt)}
                    {r.dueDatePreference ? ` · needed by ${r.dueDatePreference.toLocaleDateString()}` : ""}
                  </div>
                </div>
                <a href={`/hr/requests/${r.id}`} className="btn btn-primary" style={{ flex: "none", height: 38 }}>Triage</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

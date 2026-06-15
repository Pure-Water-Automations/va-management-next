import { getReviewQueue } from "@/lib/reads/hr-manage";
import { getCurrentUser } from "@/lib/auth/access";
import { canDecideHire } from "@/lib/auth/roles";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ActionButton } from "@/components/ActionButton";

export const dynamic = "force-dynamic";

const PENDING = ["hours_triggered", "form_sent", "under_review"];

export default async function ReviewsPage() {
  const [user, reviews] = await Promise.all([getCurrentUser(), getReviewQueue()]);
  const canDecide = canDecideHire(user.role);
  const pending = reviews.filter((r) => PENDING.includes(r.status));
  const decided = reviews.filter((r) => !PENDING.includes(r.status));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">HR · Daily</div>
          <h1>Tier reviews</h1>
        </div>
        <span className="small">{pending.length} pending</span>
      </div>

      <Card padding={0} style={{ overflow: "hidden", marginBottom: 24 }} tourEl="/hr/reviews">
        <div style={head}><h2 style={title}>Pending</h2></div>
        {pending.length === 0 ? (
          <Empty>No tier reviews waiting.</Empty>
        ) : (
          pending.map((r) => (
            <div key={r.id} style={row}>
              <div>
                <div style={{ fontWeight: 600 }}>{r.vaName ?? r.vaId}</div>
                <div className="small">
                  {r.currentRole} → {r.targetRole ?? "next"} · {r.cumulativeHoursAtTrigger ?? 0}h ·{" "}
                  <Badge variant="warning">{r.status.replace(/_/g, " ")}</Badge>
                </div>
              </div>
              {canDecide && (
                <div style={{ display: "flex", gap: 8 }}>
                  <ActionButton
                    path="/api/hr/approve-tier"
                    body={{ reviewId: r.id, vaId: r.vaId, targetRole: r.targetRole }}
                    confirm={`Approve ${r.vaName ?? r.vaId} → ${r.targetRole ?? "next tier"}? This changes their pay.`}
                    variant="secondary"
                  >
                    Approve
                  </ActionButton>
                  <ActionButton
                    path="/api/hr/decline-tier"
                    body={{ reviewId: r.id }}
                    confirm="Decline this tier review?"
                    variant="ghost"
                  >
                    Decline
                  </ActionButton>
                </div>
              )}
            </div>
          ))
        )}
      </Card>

      <Card padding={0} style={{ overflow: "hidden" }}>
        <div style={head}><h2 style={title}>Decided</h2></div>
        {decided.length === 0 ? (
          <Empty>None yet.</Empty>
        ) : (
          decided.slice(0, 20).map((r) => (
            <div key={r.id} style={row}>
              <div>
                <div style={{ fontWeight: 600 }}>{r.vaName ?? r.vaId}</div>
                <div className="small">{r.currentRole} → {r.targetRole ?? "—"}</div>
              </div>
              <Badge variant={r.status === "approved" ? "success" : "default"}>{r.status}</Badge>
            </div>
          ))
        )}
      </Card>
    </>
  );
}

const head: React.CSSProperties = { padding: "16px 20px", borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-secondary)" };
const title: React.CSSProperties = { fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", margin: 0 };
const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1px solid var(--color-border-subtle)" };
function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 24, color: "var(--color-text-tertiary)", fontStyle: "italic" }}>{children}</div>;
}

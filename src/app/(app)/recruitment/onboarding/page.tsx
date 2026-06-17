import { getOnboarding } from "@/lib/reads/hr-extra";
import { getCurrentUser } from "@/lib/auth/access";
import { isGateReviewer } from "@/lib/auth/roles";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ActionButton } from "@/components/ActionButton";

export const dynamic = "force-dynamic";

const CHECKS: { field: string; label: string }[] = [
  { field: "gmailCreated", label: "Gmail" },
  { field: "desklogCreated", label: "DeskLog" },
  { field: "whatsappAdded", label: "WhatsApp" },
  { field: "contractUploaded", label: "Contract" },
  { field: "ndaUploaded", label: "NDA" },
  { field: "taxFormDone", label: "Tax form" },
  { field: "paymentFormDone", label: "Payment" },
  { field: "headshotUploaded", label: "Headshot" },
  { field: "handbookAck", label: "Handbook" },
];

export default async function OnboardingPage() {
  const [user, rows] = await Promise.all([getCurrentUser(), getOnboarding()]);
  const canEdit = isGateReviewer(user.role);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Recruitment</div>
          <h1>Onboarding</h1>
        </div>
        <span className="small">{rows.length} in progress</span>
      </div>

      {rows.length === 0 ? (
        <Card><div className="small">No active onboarding.</div></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {rows.map((o) => {
            const record = o as unknown as Record<string, unknown>;
            const doneCount = CHECKS.filter((c) => record[c.field] === true).length;
            return (
              <Card key={o.onboardingId}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "var(--text-md)" }}>{o.va?.name ?? o.vaName ?? o.vaId}</div>
                    <div className="small">{doneCount}/{CHECKS.length} complete · {o.status}</div>
                  </div>
                  {canEdit && doneCount === CHECKS.length && (
                    <ActionButton path="/api/onboarding/complete" body={{ vaId: o.vaId }} confirm="Mark onboarding complete?" variant="secondary">
                      Mark complete
                    </ActionButton>
                  )}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {CHECKS.map((c) => {
                    const done = record[c.field] === true;
                    return canEdit && !done ? (
                      <ActionButton key={c.field} path="/api/onboarding/set-flag" body={{ vaId: o.vaId, field: c.field, value: true }} variant="ghost">
                        {c.label}
                      </ActionButton>
                    ) : (
                      <Badge key={c.field} variant={done ? "success" : "default"} dot={done}>{c.label}</Badge>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

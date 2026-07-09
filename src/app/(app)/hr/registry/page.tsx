import { getRegistry } from "@/lib/reads/hr-manage";
import { getCurrentUser } from "@/lib/auth/access";
import { humanRole } from "@/lib/labels";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ActionButton } from "@/components/ActionButton";
import { BaselineCell, BaselineCutover, VaEmailCell } from "@/components/BaselineEditor";

export const dynamic = "force-dynamic";

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 16px",
  fontSize: "var(--text-xs)",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "var(--color-text-tertiary)",
  borderBottom: "1px solid var(--color-border)",
  whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "11px 16px",
  borderBottom: "1px solid var(--color-border-subtle)",
  whiteSpace: "nowrap",
};

function statusVariant(s: string) {
  return s === "active" ? "success" : s === "training" ? "info" : "default";
}

export default async function RegistryPage() {
  const [user, rows, cutoverRow] = await Promise.all([
    getCurrentUser(),
    getRegistry(),
    db.setting.findUnique({ where: { key: "cumulative_baseline_date" }, select: { value: true } }),
  ]);
  const canEdit = user.role === "HR_MANAGER" || user.role === "PEOPLE_OPS" || user.isAdmin;
  const active = rows.filter((r) => r.va.status !== "departed").length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">HR · Manage</div>
          <h1>VA registry</h1>
        </div>
        <span className="small">{active} active · {rows.length} total</span>
      </div>

      {canEdit && <BaselineCutover current={cutoverRow?.value ?? ""} />}

      <Card padding={0} style={{ overflow: "hidden" }} tourEl="/hr/registry">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
            <thead>
              <tr>
                {["VA", "Role", "Status", "Target/wk", "Baseline (h)", "Cumulative", "Last check-in", "Eligible", ""].map((h, i) => (
                  <th key={h || `c${i}`} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ va, cumulative, eligibility, checkinAge }) => (
                <tr key={va.vaId}>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{va.name}</div>
                    {canEdit
                      ? <VaEmailCell vaId={va.vaId} email={va.email} />
                      : <div className="small">{va.email}</div>}
                  </td>
                  <td style={td}><Badge variant="primary">{humanRole(va.compensationRole)}</Badge></td>
                  <td style={td}><Badge variant={statusVariant(va.status)} dot>{va.status}</Badge></td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{va.targetHoursWeekly ?? "—"}</td>
                  <td style={td}>
                    {canEdit ? <BaselineCell vaId={va.vaId} baselineHours={va.baselineHours} /> : <span style={{ fontFamily: "var(--font-mono)" }}>{Math.round(va.baselineHours)}h</span>}
                  </td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)" }} title={`baseline ${Math.round(va.baselineHours)}h + DeskLog ${Math.round(cumulative - va.baselineHours)}h`}>{Math.round(cumulative)}h</td>
                  <td style={td}>
                    {checkinAge == null ? (
                      <span className="small">never</span>
                    ) : (
                      <span className="small" style={{ color: checkinAge > 30 ? "var(--color-error)" : undefined }}>
                        {checkinAge}d ago
                      </span>
                    )}
                  </td>
                  <td style={td}>{eligibility.eligible ? <Badge variant="success" dot>Yes</Badge> : <span className="small">—</span>}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    {canEdit && va.status !== "departed" && (
                      <ActionButton path="/api/hr/deactivate-va" body={{ vaId: va.vaId, notes: "Deactivated via console" }} confirm={`Deactivate ${va.name}? They’ll be marked departed.`} variant="ghost">
                        Deactivate
                      </ActionButton>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: "var(--color-text-tertiary)" }}>No VAs yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

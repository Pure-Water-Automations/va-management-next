import { getRoles } from "@/lib/reads/hr-manage";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { RoleDelegationToggle } from "@/components/RoleDelegationToggle";

export const dynamic = "force-dynamic";

const money = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const th: React.CSSProperties = {
  textAlign: "left", padding: "10px 16px", fontSize: "var(--text-xs)", textTransform: "uppercase",
  letterSpacing: "0.1em", color: "var(--color-text-tertiary)", borderBottom: "1px solid var(--color-border)", whiteSpace: "nowrap",
};
const td: React.CSSProperties = { padding: "11px 16px", borderBottom: "1px solid var(--color-border-subtle)", whiteSpace: "nowrap" };

export default async function RolesPage() {
  const roles = await getRoles();
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">HR · Manage</div>
          <h1>Compensation roles</h1>
        </div>
        <span className="small">The ladder that drives pay + advancement</span>
      </div>

      <p className="small" style={{ marginBottom: "var(--space-3, 12px)", color: "var(--color-text-tertiary)" }}>
        Delegation authority controls which roles may hand off work. Default delegators are Tier 3 (Senior VA)
        and Tier 4 (Lead).
      </p>

      <Card padding={0} style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
            <thead>
              <tr>
                {["Role", "Type", "Rate", "Next role", "Hours to next", "Delegation authority", "Notes"].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.roleId}>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{r.roleName}</div>
                    <div className="small">{r.roleId}</div>
                  </td>
                  <td style={td}><Badge variant={r.compensationType === "salary" ? "info" : "default"}>{r.compensationType}</Badge></td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)" }}>
                    {r.compensationType === "salary" ? `${money(r.salaryPerPeriod)}/period` : `${money(r.hourlyRate)}/h`}
                  </td>
                  <td style={td}>{r.nextRoleId ?? "—"}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{r.minTotalHoursToReachNext ?? "—"}</td>
                  <td style={td}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <RoleDelegationToggle roleId={r.roleId} field="canDelegateTasks" checked={r.canDelegateTasks} label="Can delegate tasks" />
                      <RoleDelegationToggle roleId={r.roleId} field="canDelegateProjects" checked={r.canDelegateProjects} label="Can delegate projects" />
                    </div>
                  </td>
                  <td style={{ ...td, whiteSpace: "normal", maxWidth: 280 }} className="small">{r.additionalRequirements ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

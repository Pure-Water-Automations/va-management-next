"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Badge } from "@/components/ui/Badge";
import { RoleDelegationToggle } from "@/components/RoleDelegationToggle";

/** The CompRole enum (prisma) — the fixed ladder of tier ids a role can use. */
const ROLE_IDS = ["TRAINEE", "TIER_1", "TIER_2", "TIER_3", "TIER_4"] as const;

export type RoleRow = {
  roleId: string;
  roleName: string;
  compensationType: string; // "hourly" | "salary"
  hourlyRate: number | null;
  salaryPerPeriod: number | null;
  nextRoleId: string | null;
  minTotalHoursToReachNext: number | null;
  onAdvancementTrack: boolean;
  canDelegateTasks: boolean;
  canDelegateProjects: boolean;
  additionalRequirements: string | null;
  notes: string | null;
};

const money = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const th: React.CSSProperties = {
  textAlign: "left", padding: "10px 16px", fontSize: "var(--text-xs)", textTransform: "uppercase",
  letterSpacing: "0.1em", color: "var(--color-text-tertiary)", borderBottom: "1px solid var(--color-border)", whiteSpace: "nowrap",
};
const td: React.CSSProperties = { padding: "11px 16px", borderBottom: "1px solid var(--color-border-subtle)", whiteSpace: "nowrap" };
const label: React.CSSProperties = { display: "block", fontSize: "var(--text-xs)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-tertiary)", marginBottom: 6 };
const input: React.CSSProperties = { width: "100%", border: "1px solid var(--color-border)", borderRadius: "var(--radius-input)", padding: "9px 11px", font: "inherit", fontSize: "var(--text-sm)", background: "#fff", outline: "none" };

type Draft = {
  roleId: string;
  roleName: string;
  compensationType: string;
  hourlyRate: string;
  salaryPerPeriod: string;
  nextRoleId: string;
  minTotalHoursToReachNext: string;
  onAdvancementTrack: boolean;
  additionalRequirements: string;
  notes: string;
};

function toDraft(r: RoleRow): Draft {
  return {
    roleId: r.roleId,
    roleName: r.roleName,
    compensationType: r.compensationType || "hourly",
    hourlyRate: r.hourlyRate?.toString() ?? "",
    salaryPerPeriod: r.salaryPerPeriod?.toString() ?? "",
    nextRoleId: r.nextRoleId ?? "",
    minTotalHoursToReachNext: r.minTotalHoursToReachNext?.toString() ?? "",
    onAdvancementTrack: r.onAdvancementTrack,
    additionalRequirements: r.additionalRequirements ?? "",
    notes: r.notes ?? "",
  };
}

export function RolesManager({ roles, canEdit }: { roles: RoleRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configured = new Set(roles.map((r) => r.roleId));
  const unconfigured = ROLE_IDS.filter((id) => !configured.has(id));

  function openEdit(r: RoleRow) {
    setIsNew(false);
    setError(null);
    setEditing(toDraft(r));
  }
  function openNew() {
    setIsNew(true);
    setError(null);
    setEditing({
      roleId: unconfigured[0] ?? "",
      roleName: "",
      compensationType: "hourly",
      hourlyRate: "",
      salaryPerPeriod: "",
      nextRoleId: "",
      minTotalHoursToReachNext: "",
      onAdvancementTrack: true,
      additionalRequirements: "",
      notes: "",
    });
  }

  async function save() {
    if (!editing) return;
    if (!editing.roleId) {
      setError("Pick a tier id.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await postAction("/api/hr/save-role", {
      roleId: editing.roleId,
      roleName: editing.roleName.trim() || editing.roleId,
      compensationType: editing.compensationType,
      hourlyRate: editing.compensationType === "hourly" ? editing.hourlyRate : "",
      salaryPerPeriod: editing.compensationType === "salary" ? editing.salaryPerPeriod : "",
      onAdvancementTrack: editing.onAdvancementTrack,
      minTotalHoursToReachNext: editing.minTotalHoursToReachNext,
      nextRoleId: editing.nextRoleId,
      additionalRequirements: editing.additionalRequirements,
      notes: editing.notes,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error || "Could not save the role.");
      return;
    }
    setEditing(null);
    router.refresh();
  }

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setEditing((d) => (d ? { ...d, [key]: value } : d));
  }

  return (
    <>
      {canEdit && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button type="button" className="btn btn-primary" onClick={openNew} disabled={unconfigured.length === 0} title={unconfigured.length === 0 ? "All tiers are configured" : "Add a tier"}>
            + Add role
          </button>
        </div>
      )}

      <div className="surface" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
            <thead>
              <tr>
                {["Role", "Type", "Rate", "Next role", "Hours to next", "Delegation authority", "Notes", ...(canEdit ? [""] : [])].map((h, i) => (
                  <th key={h || `c${i}`} style={th}>{h}</th>
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
                  {canEdit && (
                    <td style={{ ...td, textAlign: "right" }}>
                      <button type="button" className="btn btn-ghost" style={{ height: 32 }} onClick={() => openEdit(r)}>Edit</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div onClick={() => !saving && setEditing(null)} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(11,18,32,.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px", overflowY: "auto" }}>
          <div onClick={(e) => e.stopPropagation()} className="surface" style={{ width: 520, maxWidth: "100%", padding: 24, borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-xl)" }}>
            <h2 style={{ margin: "0 0 16px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-xl)", color: "var(--color-navy-900)" }}>
              {isNew ? "Add compensation role" : `Edit ${editing.roleName || editing.roleId}`}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={label}>Tier id</label>
                  {isNew ? (
                    <select style={input} value={editing.roleId} onChange={(e) => set("roleId", e.target.value)}>
                      {unconfigured.map((id) => <option key={id} value={id}>{id}</option>)}
                    </select>
                  ) : (
                    <input style={{ ...input, background: "var(--color-bg-secondary)" }} value={editing.roleId} disabled />
                  )}
                </div>
                <div>
                  <label style={label}>Display name</label>
                  <input style={input} value={editing.roleName} onChange={(e) => set("roleName", e.target.value)} placeholder="e.g. Senior VA" />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={label}>Compensation type</label>
                  <select style={input} value={editing.compensationType} onChange={(e) => set("compensationType", e.target.value)}>
                    <option value="hourly">Hourly</option>
                    <option value="salary">Salary</option>
                  </select>
                </div>
                {editing.compensationType === "salary" ? (
                  <div>
                    <label style={label}>Salary / period (USD)</label>
                    <input style={input} type="number" value={editing.salaryPerPeriod} onChange={(e) => set("salaryPerPeriod", e.target.value)} />
                  </div>
                ) : (
                  <div>
                    <label style={label}>Hourly rate (USD)</label>
                    <input style={input} type="number" value={editing.hourlyRate} onChange={(e) => set("hourlyRate", e.target.value)} />
                  </div>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={label}>Next role</label>
                  <select style={input} value={editing.nextRoleId} onChange={(e) => set("nextRoleId", e.target.value)}>
                    <option value="">— none (top of ladder) —</option>
                    {ROLE_IDS.filter((id) => id !== editing.roleId).map((id) => <option key={id} value={id}>{id}</option>)}
                  </select>
                </div>
                <div>
                  <label style={label}>Hours to next</label>
                  <input style={input} type="number" value={editing.minTotalHoursToReachNext} onChange={(e) => set("minTotalHoursToReachNext", e.target.value)} />
                </div>
              </div>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
                <input type="checkbox" checked={editing.onAdvancementTrack} onChange={(e) => set("onAdvancementTrack", e.target.checked)} />
                On the advancement track (eligible to be promoted to the next role)
              </label>
              <div>
                <label style={label}>Additional requirements</label>
                <textarea style={{ ...input, minHeight: 60, resize: "vertical" }} value={editing.additionalRequirements} onChange={(e) => set("additionalRequirements", e.target.value)} placeholder="e.g. Passing evaluation, supervisor sign-off" />
              </div>
              <div>
                <label style={label}>Notes</label>
                <textarea style={{ ...input, minHeight: 50, resize: "vertical" }} value={editing.notes} onChange={(e) => set("notes", e.target.value)} />
              </div>
              {error && <p style={{ color: "var(--color-error)", fontSize: "var(--text-sm)", margin: 0 }}>{error}</p>}
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button type="button" className="btn btn-primary" onClick={save} disabled={saving} style={{ opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Saving…" : "Save role"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

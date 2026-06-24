"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";

type Member = { userId: string; name: string | null; email: string; role: "LEAD" | "MEMBER"; staffRole: string };
type Staff = { id: string; name: string | null; email: string; role: string };

const ctl: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  padding: "6px 9px",
  font: "inherit",
  fontSize: 13,
  background: "var(--color-surface, #fff)",
};

const roleLabel = (r: string) => r.replace(/_/g, " ").toLowerCase();

/** Manage which staff are assigned to a client (account manager/Lead + VAs). HR-only. */
export function ClientTeamManager({ orgId, team, staff }: { orgId: string; team: Member[]; staff: Staff[] }) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<"LEAD" | "MEMBER">("MEMBER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assigned = new Set(team.map((t) => t.userId));
  const available = staff.filter((s) => !assigned.has(s.id));

  async function call(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await postAction("/api/hr/client-team", { orgId, ...body });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Something went wrong");
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {team.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>No one assigned yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {team.map((m) => (
            <div key={m.userId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 500, fontSize: 14 }}>{m.name ?? m.email}</span>
                {m.role === "LEAD" && (
                  <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "#fff", background: "var(--accent, #0066cc)", padding: "1px 6px", borderRadius: 5 }}>
                    Lead
                  </span>
                )}
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {m.email} · {roleLabel(m.staffRole)}
                </div>
              </div>
              <select
                value={m.role}
                disabled={busy}
                onChange={(e) => call({ userId: m.userId, role: e.target.value })}
                style={ctl}
                aria-label="Assignment role"
              >
                <option value="LEAD">Lead / account manager</option>
                <option value="MEMBER">VA on this client</option>
              </select>
              <button
                onClick={() => call({ userId: m.userId, action: "remove" })}
                disabled={busy}
                title="Remove from client"
                style={{ border: "1px solid var(--color-border)", borderRadius: 6, background: "transparent", padding: "5px 9px", cursor: "pointer", fontSize: 13, color: "var(--text-secondary)" }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {available.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", paddingTop: 4 }}>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} style={{ ...ctl, minWidth: 200 }} aria-label="Staff to assign">
            <option value="">Add a team member…</option>
            {available.map((s) => (
              <option key={s.id} value={s.id}>
                {(s.name ?? s.email)} · {roleLabel(s.role)}
              </option>
            ))}
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value as "LEAD" | "MEMBER")} style={ctl} aria-label="Role">
            <option value="MEMBER">VA on this client</option>
            <option value="LEAD">Lead / account manager</option>
          </select>
          <button
            onClick={() => userId && call({ userId, role }).then((ok) => ok && setUserId(""))}
            disabled={busy || !userId}
            style={{ background: "var(--accent, #0066cc)", color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: busy || !userId ? "not-allowed" : "pointer", opacity: busy || !userId ? 0.6 : 1 }}
          >
            Assign
          </button>
        </div>
      )}

      {error && <div style={{ fontSize: 13, color: "var(--color-danger, #c0392b)" }}>{error}</div>}
    </div>
  );
}

"use client";

import { useState, type CSSProperties } from "react";
import { ProgressBar, BAR_GRADIENTS, StatusChip, cardStyle, useToast } from "@/components/sales/ui";
import { SALES_OWNERS, ownerLabel } from "@/lib/sales/owners";
import type { GoalRow } from "@/lib/reads/lead";

const GOAL_STATUSES = ["Not started", "In progress", "On track", "At risk", "Done"];

// Owner select order per the design: Justin, Mark, Lei, Zawadi.
const OWNER_ORDER = ["justin", "mark", "lei", "zawadi"];
const OWNERS = OWNER_ORDER.flatMap((k) => SALES_OWNERS.filter((o) => o.key === k));

async function call(body: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  return fetch("/api/lead", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
    .then((r) => r.json())
    .catch(() => ({ ok: false, error: "Network error — please try again." }));
}

export function GoalsClient({ goals: initial, quarter }: { goals: GoalRow[]; quarter: string }) {
  const [goals, setGoals] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [ownerEmail, setOwnerEmail] = useState(OWNERS[0]?.email ?? "");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, showToast] = useToast();

  async function addGoal() {
    if (!title.trim()) {
      showToast("Give the goal a name.");
      return;
    }
    setSaving(true);
    const res = await call({ op: "goal_create", title: title.trim(), ownerEmail, due: due.trim() || "Sep 30" });
    setSaving(false);
    if (!res.ok) {
      showToast(res.error || "Could not add the goal.");
      return;
    }
    const created = res.result as { id: string; title: string; ownerEmail: string; due: string; status: string; krs: unknown };
    const krs = Array.isArray(created.krs)
      ? (created.krs as { id: string; label: string; done: boolean }[])
      : [{ id: "k1", label: "Define the first key result", done: false }];
    setGoals((gs) => [{ id: created.id, title: created.title, ownerEmail: created.ownerEmail, due: created.due, status: created.status, krs }, ...gs]);
    setTitle("");
    setDue("");
    setShowForm(false);
    showToast("Goal added.");
  }

  function patchLocal(id: string, patch: Partial<GoalRow>) {
    setGoals((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }

  async function updateGoal(id: string, patch: { ownerEmail?: string; status?: string }) {
    patchLocal(id, patch);
    const res = await call({ op: "goal_update", id, ...patch });
    if (!res.ok) showToast(res.error || "Could not update the goal.");
    else showToast("Goal updated.");
  }

  async function toggleKr(goal: GoalRow, krId: string) {
    patchLocal(goal.id, { krs: goal.krs.map((k) => (k.id === krId ? { ...k, done: !k.done } : k)) });
    const res = await call({ op: "goal_kr_toggle", id: goal.id, krId });
    if (!res.ok) {
      // roll back on failure
      patchLocal(goal.id, { krs: goal.krs });
      showToast(res.error || "Could not update the key result.");
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="crumb">Team Lead</div>
          <h1>Goals — {quarter}</h1>
          <p className="small" style={{ maxWidth: 740 }}>
            The handful of things that matter this quarter. Check off key results as they land; the
            numbers-per-month view lives in Targets.
          </p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} style={primaryPill}>
          {showForm ? "Cancel" : "+ New goal"}
        </button>
      </div>

      {showForm && (
        <div style={{ ...cardStyle, borderRadius: 14, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addGoal();
            }}
            placeholder="What is the goal? e.g. Launch the client referral page"
            style={{ ...inputBase, flex: 1, minWidth: 260 }}
          />
          <select value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} style={selectBase}>
            {OWNERS.map((o) => (
              <option key={o.key} value={o.email}>
                {o.name}
              </option>
            ))}
          </select>
          <input value={due} onChange={(e) => setDue(e.target.value)} placeholder="Due, e.g. Sep 30" style={{ ...inputBase, width: 120 }} />
          <button onClick={() => void addGoal()} disabled={saving} style={primaryPill}>
            {saving ? "Adding…" : "Add goal"}
          </button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(400px, 100%), 1fr))", gap: 14 }}>
        {goals.map((g) => {
          const done = g.krs.filter((k) => k.done).length;
          const total = Math.max(1, g.krs.length);
          const pct = done / total;
          return (
            <div key={g.id} style={{ ...cardStyle, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 16.5, fontWeight: 600, color: "var(--color-navy-900, #132272)" }}>
                  {g.title}
                </div>
                <StatusChip status={g.status} />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <select
                  value={g.ownerEmail}
                  onChange={(e) => void updateGoal(g.id, { ownerEmail: e.target.value })}
                  style={{ ...selectBase, fontSize: 12, padding: "4px 8px" }}
                  title={`Owner: ${ownerLabel(g.ownerEmail)}`}
                >
                  {OWNERS.map((o) => (
                    <option key={o.key} value={o.email}>
                      {o.name}
                    </option>
                  ))}
                  {!OWNERS.some((o) => o.email === g.ownerEmail) && g.ownerEmail ? (
                    <option value={g.ownerEmail}>{ownerLabel(g.ownerEmail)}</option>
                  ) : null}
                </select>
                <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>Due {g.due || "—"}</span>
                <select
                  value={g.status}
                  onChange={(e) => void updateGoal(g.id, { status: e.target.value })}
                  style={{ ...selectBase, fontSize: 12, padding: "4px 8px", marginLeft: "auto" }}
                >
                  {GOAL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                  {done} of {g.krs.length} key results
                </div>
                <ProgressBar pct={pct} height={7} fill={pct >= 1 ? "var(--color-success, #30c97a)" : BAR_GRADIENTS.sky} />
              </div>

              <div style={{ borderTop: "1px solid var(--color-border-subtle, #e8e8ed)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                {g.krs.map((k) => (
                  <label key={k.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={k.done}
                      onChange={() => void toggleKr(g, k.id)}
                      style={{ width: 15, height: 15, accentColor: "#132272", marginTop: 2 }}
                    />
                    <span
                      style={{
                        fontSize: 13,
                        color: k.done ? "var(--color-text-tertiary)" : "var(--color-text-primary)",
                        textDecoration: k.done ? "line-through" : "none",
                      }}
                    >
                      {k.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {toast}
    </div>
  );
}

const primaryPill: CSSProperties = {
  border: "none",
  borderRadius: 9999,
  padding: "10px 18px",
  background: "var(--color-navy-900, #132272)",
  color: "#fff",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const inputBase: CSSProperties = {
  border: "1px solid var(--color-border, #d2d2d7)",
  borderRadius: 10,
  padding: "9px 12px",
  font: "inherit",
  fontSize: 13,
  color: "var(--color-navy-900, #132272)",
  background: "var(--color-surface, #fff)",
  outline: "none",
};

const selectBase: CSSProperties = {
  border: "1px solid var(--color-border-subtle, #e8e8ed)",
  borderRadius: 8,
  padding: "8px 10px",
  font: "inherit",
  fontSize: 13,
  color: "var(--color-navy-900, #132272)",
  background: "var(--color-surface, #fff)",
  outline: "none",
};

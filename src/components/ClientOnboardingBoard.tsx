"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type OnboardingRow = {
  orgId: string;
  orgName: string;
  orgStatus: string;
  status: string;
  owner: string | null;
  intakeReceived: boolean;
  onboardingCallBooked: boolean;
  onboardingCallDone: boolean;
  driveFolderCreated: boolean;
  portalAccessGranted: boolean;
  commsCadenceSet: boolean;
  firstWeekPriorities: boolean;
  vaAssigned: boolean;
  kickoffRecapSent: boolean;
};

const CHECKLIST: { field: keyof OnboardingRow; label: string }[] = [
  { field: "intakeReceived", label: "Intake form received" },
  { field: "onboardingCallBooked", label: "Onboarding call booked" },
  { field: "onboardingCallDone", label: "Onboarding call done" },
  { field: "driveFolderCreated", label: "Drive folder created" },
  { field: "portalAccessGranted", label: "Portal access granted" },
  { field: "commsCadenceSet", label: "Comms cadence set" },
  { field: "firstWeekPriorities", label: "First-week priorities set" },
  { field: "vaAssigned", label: "VA assigned" },
  { field: "kickoffRecapSent", label: "Kickoff recap sent" },
];

async function call(body: Record<string, unknown>) {
  const r = await fetch("/api/hr/client-onboarding", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ ok: false, error: "Bad response" }));
}

export function ClientOnboardingBoard({ rows }: { rows: OnboardingRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(key: string, body: Record<string, unknown>) {
    setBusy(key);
    setMsg(null);
    const res = await call(body);
    setBusy(null);
    if (res.ok) router.refresh();
    else setMsg(res.error || "Failed.");
  }

  if (rows.length === 0) return <p className="small">No clients in onboarding yet.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {msg && <span className="small" style={{ color: "#c0392b" }}>{msg}</span>}
      {rows.map((r) => {
        const complete = CHECKLIST.every((c) => r[c.field] as boolean);
        return (
          <div key={r.orgId} style={{ border: "1px solid var(--border,#ddd)", borderRadius: 8, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div>
                <span style={{ fontWeight: 600 }}>{r.orgName}</span>
                <span className="small" style={{ marginLeft: 10 }}>org: {r.orgStatus} · onboarding: {r.status}{r.owner ? ` · owner: ${r.owner}` : ""}</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" disabled={busy === `intake-${r.orgId}`} onClick={() => run(`intake-${r.orgId}`, { op: "send_intake", orgId: r.orgId })}>Send intake form</button>
                <button type="button" disabled={!complete || r.status === "completed" || busy === `done-${r.orgId}`} onClick={() => run(`done-${r.orgId}`, { op: "complete", orgId: r.orgId })}>
                  {r.status === "completed" ? "Completed" : "Mark complete"}
                </button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6 }}>
              {CHECKLIST.map((c) => {
                const on = r[c.field] as boolean;
                return (
                  <label key={String(c.field)} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={busy === `flag-${r.orgId}-${String(c.field)}`}
                      onChange={(e) => run(`flag-${r.orgId}-${String(c.field)}`, { op: "set_flag", orgId: r.orgId, field: c.field, value: e.target.checked })}
                    />
                    <span>{c.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

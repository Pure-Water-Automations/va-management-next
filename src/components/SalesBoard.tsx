"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

export type DealRow = {
  id: string;
  orgName: string;
  contactName: string | null;
  contactEmail: string | null;
  stage: string;
  packageName: string | null;
  dealValue: number | null;
  billingType: string | null;
  startDate: string | null;
  clientOrgId: string | null;
  source: string | null;
  leadVerdict: string | null;
  leadScore: number | null;
  leadSummary: string | null;
  agreement: { status: string; sent: boolean; signed: boolean; paid: boolean } | null;
};

const STAGES = [
  "new",
  "discovery_scheduled",
  "discovery_completed",
  "proposal_needed",
  "proposal_sent",
  "negotiation",
  "verbal_yes",
  "won",
  "lost",
  "nurture",
  "no_show",
];

async function call(body: Record<string, unknown>) {
  const r = await fetch("/api/hr/sales", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ ok: false, error: "Bad response" }));
}

export function SalesBoard({ deals }: { deals: DealRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  async function run(key: string, body: Record<string, unknown>) {
    setBusy(key);
    setMsg(null);
    const res = await call(body);
    setBusy(null);
    if (res.ok) {
      setMsg("Done.");
      router.refresh();
    } else {
      setMsg(res.error || "Failed.");
    }
  }

  return (
    <div>
      <div style={{ margin: "8px 0 16px", display: "flex", gap: 12, alignItems: "center" }}>
        <button type="button" onClick={() => setShowNew((s) => !s)}>{showNew ? "Cancel" : "+ New deal"}</button>
        {msg && <span className="small">{msg}</span>}
      </div>

      {showNew && <NewDealForm onCreate={(b) => run("new", { op: "create_deal", ...b }).then(() => setShowNew(false))} busy={busy === "new"} />}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border, #ddd)" }}>
            <th style={{ padding: 8 }}>Deal</th>
            <th style={{ padding: 8 }}>Stage</th>
            <th style={{ padding: 8 }}>Agreement</th>
            <th style={{ padding: 8 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {deals.length === 0 && (
            <tr><td colSpan={4} style={{ padding: 16, color: "var(--text-secondary,#777)" }}>No deals yet. Add one at “Verbal Yes”.</td></tr>
          )}
          {deals.map((d) => {
            const a = d.agreement;
            const signedPaid = !!a?.signed && !!a?.paid;
            return (
              <tr key={d.id} style={{ borderBottom: "1px solid var(--border,#eee)", verticalAlign: "top" }}>
                <td style={{ padding: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {d.leadVerdict && <ScoreChip verdict={d.leadVerdict} score={d.leadScore} />}
                    <span style={{ fontWeight: 600 }}>{d.orgName}</span>
                    {d.source === "native_form" && <span style={tagStyle}>discover</span>}
                  </div>
                  <div className="small">{d.contactName || ""} {d.contactEmail ? `· ${d.contactEmail}` : ""}</div>
                  {d.leadSummary && <div className="small" style={{ color: "var(--text-secondary,#666)", maxWidth: 420 }}>{d.leadSummary}</div>}
                  <div className="small">{d.packageName || "—"}{d.dealValue ? ` · $${d.dealValue.toLocaleString()}` : ""}{d.billingType ? ` · ${d.billingType}` : ""}</div>
                </td>
                <td style={{ padding: 8 }}>
                  <select defaultValue={d.stage} onChange={(e) => run(`stage-${d.id}`, { op: "set_stage", dealId: d.id, stage: e.target.value })} disabled={busy === `stage-${d.id}`}>
                    {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td style={{ padding: 8 }} className="small">
                  {a ? (
                    <>
                      <Badge on={a.sent} label="sent" />
                      <Badge on={a.signed} label="signed" />
                      <Badge on={a.paid} label="paid" />
                    </>
                  ) : <span style={{ color: "#999" }}>none</span>}
                </td>
                <td style={{ padding: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <button type="button" disabled={!d.contactEmail || busy === `send-${d.id}`} onClick={() => run(`send-${d.id}`, { op: "send_agreement", dealId: d.id })}>
                    {a?.sent ? "Resend agreement" : "Send agreement"}
                  </button>
                  <button type="button" disabled={!a?.signed || !!a?.paid || busy === `paid-${d.id}`} onClick={() => run(`paid-${d.id}`, { op: "mark_paid", dealId: d.id })}>
                    Mark paid
                  </button>
                  <button type="button" disabled={!signedPaid || !!d.clientOrgId || busy === `conv-${d.id}`} onClick={() => run(`conv-${d.id}`, { op: "convert", dealId: d.id })}>
                    {d.clientOrgId ? "Client created" : "Create client"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Badge({ on, label }: { on: boolean; label: string }) {
  return (
    <span style={{ display: "inline-block", marginRight: 6, padding: "1px 7px", borderRadius: 10, fontSize: 11, background: on ? "#d6f5e0" : "#eee", color: on ? "#0a7d3c" : "#888" }}>
      {label}
    </span>
  );
}

function ScoreChip({ verdict, score }: { verdict: string; score: number | null }) {
  const c =
    verdict === "hot" ? { bg: "#d4f5e2", fg: "#1a7a4a" } :
    verdict === "warm" ? { bg: "#fff3d4", fg: "#966200" } :
    { bg: "#e8e8ed", fg: "#48484a" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 9px", borderRadius: 9999, fontSize: 11, fontWeight: 700, background: c.bg, color: c.fg, textTransform: "capitalize" }}>
      {verdict}{typeof score === "number" ? ` ${score}` : ""}
    </span>
  );
}

const tagStyle: CSSProperties = { padding: "1px 7px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: "var(--color-sky-100, #c4eef9)", color: "var(--color-sky-800, #0d5e7e)", textTransform: "uppercase", letterSpacing: "0.04em" };

function NewDealForm({ onCreate, busy }: { onCreate: (b: Record<string, unknown>) => void; busy: boolean }) {
  const [f, setF] = useState<Record<string, string>>({ stage: "verbal_yes" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <div style={{ border: "1px solid var(--border,#ddd)", borderRadius: 8, padding: 16, marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 760 }}>
      <Field label="Organization *"><input value={f.orgName ?? ""} onChange={set("orgName")} /></Field>
      <Field label="Contact name"><input value={f.contactName ?? ""} onChange={set("contactName")} /></Field>
      <Field label="Contact email"><input value={f.contactEmail ?? ""} onChange={set("contactEmail")} /></Field>
      <Field label="Account owner email"><input value={f.accountOwnerEmail ?? ""} onChange={set("accountOwnerEmail")} /></Field>
      <Field label="Package"><input value={f.packageName ?? ""} onChange={set("packageName")} /></Field>
      <Field label="Deal value (USD)"><input value={f.dealValue ?? ""} onChange={set("dealValue")} inputMode="numeric" /></Field>
      <Field label="Billing type">
        <select value={f.billingType ?? ""} onChange={set("billingType")}>
          <option value="">—</option>
          <option value="retainer">retainer</option>
          <option value="hourly">hourly</option>
          <option value="project">project</option>
        </select>
      </Field>
      <Field label="Start date"><input type="date" value={f.startDate ?? ""} onChange={set("startDate")} /></Field>
      <Field label="Notion deal URL/ID"><input value={f.notionPageId ?? ""} onChange={set("notionPageId")} /></Field>
      <Field label="Stage">
        <select value={f.stage ?? "verbal_yes"} onChange={set("stage")}>
          {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <div style={{ gridColumn: "1 / -1" }}>
        <button type="button" disabled={busy || !f.orgName} onClick={() => onCreate(f)}>{busy ? "Creating…" : "Create deal"}</button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
      <span style={{ color: "var(--text-secondary,#666)" }}>{label}</span>
      {children}
    </label>
  );
}

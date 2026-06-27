"use client";

import { Fragment, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { NOTE_TEXT_FIELDS, BUYING_SIGNALS, DECISION_TYPES, type DiscoveryNotes } from "@/lib/discovery-notes";

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
  discoveryCallAt: string | null;
  discoveryCallStatus: string | null;
  discoveryNotesJson: Partial<DiscoveryNotes> | null;
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
  const [openNotes, setOpenNotes] = useState<string | null>(null);

  async function run(key: string, body: Record<string, unknown>): Promise<boolean> {
    setBusy(key);
    setMsg(null);
    const res = await call(body);
    setBusy(null);
    if (res.ok) {
      setMsg("Done.");
      router.refresh();
      return true;
    }
    setMsg(res.error || "Failed.");
    return false;
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
            const inDiscovery = ["discovery_scheduled", "discovery_completed"].includes(d.stage) || !!d.discoveryCallAt || !!d.discoveryNotesJson;
            return (
              <Fragment key={d.id}>
              <tr style={{ borderBottom: "1px solid var(--border,#eee)", verticalAlign: "top" }}>
                <td style={{ padding: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {d.leadVerdict && <ScoreChip verdict={d.leadVerdict} score={d.leadScore} />}
                    <span style={{ fontWeight: 600 }}>{d.orgName}</span>
                    {d.source === "native_form" && <span style={tagStyle}>discover</span>}
                  </div>
                  <div className="small">{d.contactName || ""} {d.contactEmail ? `· ${d.contactEmail}` : ""}</div>
                  {d.leadSummary && <div className="small" style={{ color: "var(--text-secondary,#666)", maxWidth: 420 }}>{d.leadSummary}</div>}
                  {d.discoveryCallAt && (
                    <div className="small" style={{ color: d.discoveryCallStatus === "cancelled" ? "#a32d2d" : "#0d5e7e" }}>
                      📅 {new Date(d.discoveryCallAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      {d.discoveryCallStatus && d.discoveryCallStatus !== "scheduled" ? ` · ${d.discoveryCallStatus}` : ""}
                    </div>
                  )}
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
                  {inDiscovery && (
                    <button type="button" onClick={() => setOpenNotes((o) => (o === d.id ? null : d.id))}>
                      {openNotes === d.id ? "Hide notes" : d.discoveryNotesJson ? "Edit notes" : "Call notes"}
                    </button>
                  )}
                  {d.discoveryCallStatus === "scheduled" && (
                    <button type="button" disabled={busy === `noshow-${d.id}`} onClick={() => run(`noshow-${d.id}`, { op: "set_call_status", dealId: d.id, status: "no_show" })}>
                      No-show
                    </button>
                  )}
                </td>
              </tr>
              {openNotes === d.id && (
                <tr style={{ borderBottom: "2px solid var(--border,#eee)", background: "var(--color-bg-secondary,#f5f5f7)" }}>
                  <td colSpan={4} style={{ padding: 16 }}>
                    <DiscoveryNotesPanel
                      deal={d}
                      busy={busy === `notes-${d.id}`}
                      onSave={(notes) => run(`notes-${d.id}`, { op: "save_discovery_notes", dealId: d.id, ...notes }).then((ok) => { if (ok) setOpenNotes(null); })}
                    />
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DiscoveryNotesPanel({ deal, busy, onSave }: { deal: DealRow; busy: boolean; onSave: (notes: Record<string, string>) => void }) {
  const existing = (deal.discoveryNotesJson ?? {}) as Record<string, string>;
  const [f, setF] = useState<Record<string, string>>({ ...existing });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 860 }}>
      <div style={{ gridColumn: "1 / -1", fontWeight: 600, color: "var(--color-navy-900,#132272)" }}>
        Discovery call notes — saving records the call{deal.stage === "discovery_scheduled" ? ", marks it complete, and advances the deal to “discovery completed”" : ""}.
      </div>
      {NOTE_TEXT_FIELDS.map((field) => (
        <label key={field.key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, gridColumn: field.long ? "1 / -1" : "auto" }}>
          <span style={{ color: "var(--text-secondary,#666)" }}>{field.label}</span>
          {field.long ? (
            <textarea value={f[field.key] ?? ""} onChange={set(field.key)} rows={2} style={notesInput} />
          ) : (
            <input value={f[field.key] ?? ""} onChange={set(field.key)} style={notesInput} />
          )}
        </label>
      ))}
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
        <span style={{ color: "var(--text-secondary,#666)" }}>Buying signal</span>
        <select value={f.buyingSignals ?? ""} onChange={set("buyingSignals")} style={notesInput}>
          <option value="">—</option>
          {BUYING_SIGNALS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
        <span style={{ color: "var(--text-secondary,#666)" }}>Decision process</span>
        <select value={f.decisionProcess ?? ""} onChange={set("decisionProcess")} style={notesInput}>
          <option value="">—</option>
          {DECISION_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
        <span style={{ color: "var(--text-secondary,#666)" }}>Follow-up date</span>
        <input type="date" value={f.followUpDate ?? ""} onChange={set("followUpDate")} style={notesInput} />
      </label>
      <div style={{ gridColumn: "1 / -1" }}>
        <button type="button" disabled={busy} onClick={() => onSave(f)}>{busy ? "Saving…" : "Save notes"}</button>
      </div>
    </div>
  );
}

const notesInput: CSSProperties = { border: "1px solid var(--border,#ccc)", borderRadius: 8, padding: "7px 9px", font: "inherit", fontSize: 13 };

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

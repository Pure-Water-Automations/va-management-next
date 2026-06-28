"use client";

import { useMemo, useState, type CSSProperties, type DragEvent } from "react";
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
  accountOwnerEmail: string | null;
  source: string | null;
  leadVerdict: string | null;
  leadScore: number | null;
  leadSummary: string | null;
  discoveryCallAt: string | null;
  discoveryCallStatus: string | null;
  discoveryNotesJson: Partial<DiscoveryNotes> | null;
  agreement: { status: string; sent: boolean; signed: boolean; paid: boolean } | null;
};

const STAGES = ["new", "discovery_scheduled", "discovery_completed", "proposal_needed", "proposal_sent", "negotiation", "verbal_yes", "won", "lost", "nurture", "no_show"];
const STAGE_LABEL: Record<string, string> = {
  new: "New", discovery_scheduled: "Discovery scheduled", discovery_completed: "Discovery completed",
  proposal_needed: "Proposal needed", proposal_sent: "Proposal sent", negotiation: "Negotiation",
  verbal_yes: "Verbal yes", won: "Won", lost: "Lost", nurture: "Nurture", no_show: "No-show",
};
const STAGE_DOT: Record<string, string> = {
  new: "#378add", discovery_scheduled: "#2ab0d8", discovery_completed: "#1d9e75",
  proposal_needed: "#ba7517", proposal_sent: "#ef9f27", negotiation: "#d4537e",
  verbal_yes: "#639922", won: "#30c97a", lost: "#a32d2d", nurture: "#7c7c82", no_show: "#a32d2d",
};

async function call(body: Record<string, unknown>) {
  const r = await fetch("/api/hr/sales", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ ok: false, error: "Bad response" }));
}

function initials(email: string | null): string {
  if (!email) return "—";
  const local = email.split("@")[0];
  const parts = local.split(/[._-]+/).filter(Boolean);
  const s = parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
  return s.toUpperCase();
}
function money(n: number): string {
  return n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n.toLocaleString()}`;
}

export function SalesBoard({ deals, canFinance = true, testimonials }: { deals: DealRow[]; canFinance?: boolean; testimonials?: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "list" | "testimonials">("board");
  const [query, setQuery] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragStage, setDragStage] = useState<string | null>(null);

  async function run(key: string, body: Record<string, unknown>): Promise<boolean> {
    setBusy(key);
    setMsg(null);
    const res = await call(body);
    setBusy(null);
    if (res.ok) { setMsg("Done."); router.refresh(); return true; }
    setMsg(res.error || "Failed.");
    return false;
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return deals;
    return deals.filter((d) => `${d.orgName} ${d.contactName ?? ""} ${d.contactEmail ?? ""}`.toLowerCase().includes(q));
  }, [deals, query]);

  const byStage = useMemo(() => {
    const m = new Map<string, DealRow[]>();
    for (const s of STAGES) m.set(s, []);
    for (const d of filtered) (m.get(d.stage) ?? m.set(d.stage, []).get(d.stage)!).push(d);
    return m;
  }, [filtered]);

  const stats = useMemo(() => {
    const count = (s: string) => deals.filter((d) => d.stage === s).length;
    const proposals = deals.filter((d) => d.stage === "proposal_sent" || d.stage === "negotiation");
    return {
      newLeads: count("new"),
      discoveryScheduled: count("discovery_scheduled"),
      proposalsOut: proposals.length,
      inPlay: proposals.reduce((sum, d) => sum + (d.dealValue || 0), 0),
      won: count("won"),
    };
  }, [deals]);

  const current = openId ? deals.find((d) => d.id === openId) ?? null : null;

  function onDrop(e: DragEvent, stage: string) {
    e.preventDefault();
    setDragStage(null);
    const id = e.dataTransfer.getData("text/plain");
    const d = deals.find((x) => x.id === id);
    if (id && d && d.stage !== stage) void run(`stage-${id}`, { op: "set_stage", dealId: id, stage });
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={toolbar}>
        <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
          <span style={{ position: "absolute", left: 12, top: 9, color: "var(--color-text-tertiary,#98989d)" }}>⌕</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search leads…" style={search} />
        </div>
        <div style={tabs}>
          {(["board", "list", "testimonials"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} style={tabBtn(view === v)}>
              {v === "board" ? "Board" : v === "list" ? "List" : "Testimonials"}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setShowNew(true)} style={primaryBtn}>+ New lead</button>
        {msg && <span className="small" style={{ color: "var(--color-text-secondary,#666)" }}>{msg}</span>}
      </div>

      {view === "board" && (
        <>
          <div style={statStrip}>
            <StatCard label="New leads" value={stats.newLeads} sub="awaiting first touch" />
            <StatCard label="Discovery scheduled" value={stats.discoveryScheduled} sub="upcoming calls" />
            <StatCard label="Proposals out" value={stats.proposalsOut} sub={stats.inPlay ? `${money(stats.inPlay)} in play` : "—"} accent />
            <StatCard label="Won" value={stats.won} sub="closed clients" />
          </div>

          <div style={boardScroll}>
            {STAGES.map((stage) => {
              const cards = byStage.get(stage) ?? [];
              return (
                <div
                  key={stage}
                  onDragOver={(e) => { e.preventDefault(); setDragStage(stage); }}
                  onDragLeave={() => setDragStage((s) => (s === stage ? null : s))}
                  onDrop={(e) => onDrop(e, stage)}
                  style={column(dragStage === stage)}
                >
                  <div style={columnHead}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: STAGE_DOT[stage], display: "inline-block" }} />
                    <span style={{ fontWeight: 600, fontSize: 13, color: "var(--color-navy-900,#132272)" }}>{STAGE_LABEL[stage]}</span>
                    <span style={countPill}>{cards.length}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {cards.map((d) => <DealCard key={d.id} deal={d} onOpen={() => setOpenId(d.id)} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {view === "list" && <DealList deals={filtered} onOpen={(id) => setOpenId(id)} />}

      {view === "testimonials" && (
        <div style={{ maxWidth: 640 }}>
          {testimonials ? (
            <blockquote style={{ margin: 0, padding: "16px 20px", borderLeft: "3px solid var(--color-sky-300,#6dd5f0)", background: "var(--color-surface,#fff)", borderRadius: 12, fontStyle: "italic", color: "var(--color-text-secondary,#666)" }}>
              {testimonials}
            </blockquote>
          ) : (
            <p className="small">No testimonials configured yet (set the <code>discovery_testimonials</code> setting).</p>
          )}
        </div>
      )}

      {showNew && (
        <Drawer title="New lead" onClose={() => setShowNew(false)}>
          <NewDealForm busy={busy === "new"} onCreate={(b) => run("new", { op: "create_deal", ...b }).then((ok) => { if (ok) setShowNew(false); })} />
        </Drawer>
      )}

      {current && (
        <Drawer title={current.orgName} onClose={() => setOpenId(null)}>
          <DealDrawer deal={current} canFinance={canFinance} busy={busy} run={run} />
        </Drawer>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: number; sub: string; accent?: boolean }) {
  return (
    <div style={{ ...statCard, ...(accent ? statCardAccent : {}) }}>
      <div style={{ fontSize: 13, color: accent ? "rgba(255,255,255,0.8)" : "var(--color-text-secondary,#666)" }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color: accent ? "#fff" : "var(--color-navy-900,#132272)", lineHeight: 1.1, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: accent ? "rgba(255,255,255,0.7)" : "var(--color-text-tertiary,#98989d)", marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function ScoreChip({ verdict, score }: { verdict: string; score: number | null }) {
  const c = verdict === "hot" ? { bg: "#d4f5e2", fg: "#1a7a4a", dot: "#30c97a" }
    : verdict === "warm" ? { bg: "#fff3d4", fg: "#966200", dot: "#ffb340" }
    : { bg: "#e8e8ed", fg: "#48484a", dot: "#98989d" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px", borderRadius: 9999, fontSize: 11, fontWeight: 700, background: c.bg, color: c.fg, textTransform: "capitalize" }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: c.dot }} />
      {verdict}{typeof score === "number" ? ` ${score}` : ""}
    </span>
  );
}

function Avatar({ email }: { email: string | null }) {
  return (
    <span style={{ width: 28, height: 28, borderRadius: 999, background: "var(--color-navy-800,#1a278a)", color: "#fff", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} title={email ?? ""}>
      {initials(email)}
    </span>
  );
}

function callChip(d: DealRow) {
  if (!d.discoveryCallAt) return null;
  const done = d.discoveryCallStatus === "completed";
  const cancelled = d.discoveryCallStatus === "cancelled";
  const color = cancelled ? "#a32d2d" : done ? "#1a7a4a" : "#0d5e7e";
  const when = new Date(d.discoveryCallAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color }}>
      <span>📅 {when}</span>
      <span style={{ width: 5, height: 5, borderRadius: 999, background: color }} />
      {cancelled ? "cancelled" : done ? "done" : ""}
    </div>
  );
}

function DealCard({ deal, onOpen }: { deal: DealRow; onOpen: () => void }) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", deal.id)}
      onClick={onOpen}
      style={card}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontWeight: 600, color: "var(--color-navy-900,#132272)", fontSize: 14, lineHeight: 1.25 }}>{deal.orgName}</div>
        <Avatar email={deal.accountOwnerEmail} />
      </div>
      <div className="small" style={{ color: "var(--color-text-secondary,#666)", marginTop: 2 }}>{deal.contactName || deal.contactEmail || ""}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        {deal.leadVerdict && <ScoreChip verdict={deal.leadVerdict} score={deal.leadScore} />}
        {deal.source === "native_form" && <span style={tagStyle}>discover</span>}
      </div>
      {deal.leadSummary && <div style={{ fontSize: 12, color: "var(--color-text-secondary,#666)", marginTop: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{deal.leadSummary}</div>}
      {deal.discoveryCallAt && <div style={{ marginTop: 8 }}>{callChip(deal)}</div>}
      {(deal.packageName || deal.dealValue) && (
        <div className="small" style={{ marginTop: 8, color: "var(--color-text-tertiary,#98989d)" }}>
          {deal.packageName || ""}{deal.dealValue ? ` · ${money(deal.dealValue)}` : ""}
        </div>
      )}
    </div>
  );
}

function DealList({ deals, onOpen }: { deals: DealRow[]; onOpen: (id: string) => void }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
      <thead>
        <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border,#ddd)", color: "var(--color-text-secondary,#666)" }}>
          <th style={{ padding: 10 }}>Lead</th><th style={{ padding: 10 }}>Score</th><th style={{ padding: 10 }}>Stage</th><th style={{ padding: 10 }}>Call</th><th style={{ padding: 10 }}>Owner</th>
        </tr>
      </thead>
      <tbody>
        {deals.length === 0 && <tr><td colSpan={5} style={{ padding: 16, color: "var(--color-text-tertiary,#999)" }}>No leads.</td></tr>}
        {deals.map((d) => (
          <tr key={d.id} onClick={() => onOpen(d.id)} style={{ borderBottom: "1px solid var(--color-border-subtle,#eee)", cursor: "pointer" }}>
            <td style={{ padding: 10 }}>
              <div style={{ fontWeight: 600 }}>{d.orgName} {d.source === "native_form" && <span style={tagStyle}>discover</span>}</div>
              <div className="small">{d.contactName || d.contactEmail || ""}</div>
            </td>
            <td style={{ padding: 10 }}>{d.leadVerdict ? <ScoreChip verdict={d.leadVerdict} score={d.leadScore} /> : "—"}</td>
            <td style={{ padding: 10 }}><span style={{ fontSize: 12, color: "var(--color-navy-900,#132272)" }}>{STAGE_LABEL[d.stage] ?? d.stage}</span></td>
            <td style={{ padding: 10 }} className="small">{d.discoveryCallAt ? callChip(d) : "—"}</td>
            <td style={{ padding: 10 }}><Avatar email={d.accountOwnerEmail} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Right-side detail panel holding every deal action (stage, agreement, finance, call notes). */
function DealDrawer({ deal, canFinance, busy, run }: { deal: DealRow; canFinance: boolean; busy: string | null; run: (key: string, body: Record<string, unknown>) => Promise<boolean> }) {
  const a = deal.agreement;
  const signedPaid = !!a?.signed && !!a?.paid;
  const inDiscovery = ["discovery_scheduled", "discovery_completed"].includes(deal.stage) || !!deal.discoveryCallAt || !!deal.discoveryNotesJson;
  const [showNotes, setShowNotes] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {deal.leadVerdict && <ScoreChip verdict={deal.leadVerdict} score={deal.leadScore} />}
        {deal.source === "native_form" && <span style={tagStyle}>discover</span>}
        <Avatar email={deal.accountOwnerEmail} />
      </div>
      <div className="small">{deal.contactName || ""} {deal.contactEmail ? `· ${deal.contactEmail}` : ""}</div>
      {deal.leadSummary && <div style={{ fontSize: 13, color: "var(--color-text-secondary,#666)" }}>{deal.leadSummary}</div>}
      {deal.discoveryCallAt && <div>{callChip(deal)}</div>}

      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
        <span style={{ color: "var(--color-text-secondary,#666)" }}>Stage</span>
        <select value={deal.stage} onChange={(e) => run(`stage-${deal.id}`, { op: "set_stage", dealId: deal.id, stage: e.target.value })} disabled={busy === `stage-${deal.id}`} style={notesInput}>
          {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s] ?? s}</option>)}
        </select>
      </label>

      <div>
        <div className="small" style={{ marginBottom: 6, color: "var(--color-text-secondary,#666)" }}>Agreement</div>
        {a ? <><PillBadge on={a.sent} label="sent" /><PillBadge on={a.signed} label="signed" /><PillBadge on={a.paid} label="paid" /></> : <span className="small" style={{ color: "#999" }}>none</span>}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" disabled={!deal.contactEmail || busy === `send-${deal.id}`} onClick={() => run(`send-${deal.id}`, { op: "send_agreement", dealId: deal.id })} style={drawerBtn}>
          {a?.sent ? "Resend agreement" : "Send agreement"}
        </button>
        {canFinance && (
          <>
            <button type="button" disabled={!a?.signed || !!a?.paid || busy === `paid-${deal.id}`} onClick={() => run(`paid-${deal.id}`, { op: "mark_paid", dealId: deal.id })} style={drawerBtn}>Mark paid</button>
            <button type="button" disabled={!signedPaid || !!deal.clientOrgId || busy === `conv-${deal.id}`} onClick={() => run(`conv-${deal.id}`, { op: "convert", dealId: deal.id })} style={drawerBtn}>
              {deal.clientOrgId ? "Client created" : "Create client"}
            </button>
          </>
        )}
        {deal.discoveryCallStatus === "scheduled" && (
          <button type="button" disabled={busy === `noshow-${deal.id}`} onClick={() => run(`noshow-${deal.id}`, { op: "set_call_status", dealId: deal.id, status: "no_show" })} style={drawerBtn}>No-show</button>
        )}
        {inDiscovery && <button type="button" onClick={() => setShowNotes((s) => !s)} style={drawerBtn}>{showNotes ? "Hide notes" : deal.discoveryNotesJson ? "Edit call notes" : "Call notes"}</button>}
      </div>

      {showNotes && (
        <div style={{ borderTop: "1px solid var(--color-border-subtle,#eee)", paddingTop: 14 }}>
          <DiscoveryNotesPanel deal={deal} busy={busy === `notes-${deal.id}`} onSave={(notes) => run(`notes-${deal.id}`, { op: "save_discovery_notes", dealId: deal.id, ...notes }).then((ok) => { if (ok) setShowNotes(false); })} />
        </div>
      )}
    </div>
  );
}

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(13,29,95,0.35)", zIndex: 40 }} />
      <aside style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(560px, 92vw)", background: "var(--color-surface,#fff)", boxShadow: "-8px 0 40px rgba(15,28,94,0.18)", zIndex: 41, padding: "24px 28px", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", color: "var(--color-navy-900,#132272)" }}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: "none", background: "transparent", fontSize: 22, cursor: "pointer", color: "var(--color-text-tertiary,#98989d)" }}>×</button>
        </div>
        {children}
      </aside>
    </>
  );
}

function DiscoveryNotesPanel({ deal, busy, onSave }: { deal: DealRow; busy: boolean; onSave: (notes: Record<string, string>) => void }) {
  const existing = (deal.discoveryNotesJson ?? {}) as Record<string, string>;
  const [f, setF] = useState<Record<string, string>>({ ...existing });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <div style={{ gridColumn: "1 / -1", fontWeight: 600, fontSize: 13, color: "var(--color-navy-900,#132272)" }}>
        Call notes — saving records the call{deal.stage === "discovery_scheduled" ? " + advances to “discovery completed”" : ""}.
      </div>
      {NOTE_TEXT_FIELDS.map((field) => (
        <label key={field.key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, gridColumn: field.long ? "1 / -1" : "auto" }}>
          <span style={{ color: "var(--color-text-secondary,#666)" }}>{field.label}</span>
          {field.long ? <textarea value={f[field.key] ?? ""} onChange={set(field.key)} rows={2} style={notesInput} /> : <input value={f[field.key] ?? ""} onChange={set(field.key)} style={notesInput} />}
        </label>
      ))}
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
        <span style={{ color: "var(--color-text-secondary,#666)" }}>Buying signal</span>
        <select value={f.buyingSignals ?? ""} onChange={set("buyingSignals")} style={notesInput}>
          <option value="">—</option>
          {BUYING_SIGNALS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
        <span style={{ color: "var(--color-text-secondary,#666)" }}>Decision process</span>
        <select value={f.decisionProcess ?? ""} onChange={set("decisionProcess")} style={notesInput}>
          <option value="">—</option>
          {DECISION_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
        <span style={{ color: "var(--color-text-secondary,#666)" }}>Follow-up date</span>
        <input type="date" value={f.followUpDate ?? ""} onChange={set("followUpDate")} style={notesInput} />
      </label>
      <div style={{ gridColumn: "1 / -1" }}>
        <button type="button" disabled={busy} onClick={() => onSave(f)} style={primaryBtn}>{busy ? "Saving…" : "Save notes"}</button>
      </div>
    </div>
  );
}

function PillBadge({ on, label }: { on: boolean; label: string }) {
  return <span style={{ display: "inline-block", marginRight: 6, padding: "1px 8px", borderRadius: 9999, fontSize: 11, fontWeight: 600, background: on ? "#d4f5e2" : "#e8e8ed", color: on ? "#1a7a4a" : "#888" }}>{label}</span>;
}

function NewDealForm({ onCreate, busy }: { onCreate: (b: Record<string, unknown>) => void; busy: boolean }) {
  const [f, setF] = useState<Record<string, string>>({ stage: "verbal_yes" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <Field label="Organization *"><input value={f.orgName ?? ""} onChange={set("orgName")} style={notesInput} /></Field>
      <Field label="Contact name"><input value={f.contactName ?? ""} onChange={set("contactName")} style={notesInput} /></Field>
      <Field label="Contact email"><input value={f.contactEmail ?? ""} onChange={set("contactEmail")} style={notesInput} /></Field>
      <Field label="Account owner email"><input value={f.accountOwnerEmail ?? ""} onChange={set("accountOwnerEmail")} style={notesInput} /></Field>
      <Field label="Package"><input value={f.packageName ?? ""} onChange={set("packageName")} style={notesInput} /></Field>
      <Field label="Deal value (USD)"><input value={f.dealValue ?? ""} onChange={set("dealValue")} inputMode="numeric" style={notesInput} /></Field>
      <Field label="Billing type">
        <select value={f.billingType ?? ""} onChange={set("billingType")} style={notesInput}>
          <option value="">—</option><option value="retainer">retainer</option><option value="hourly">hourly</option><option value="project">project</option>
        </select>
      </Field>
      <Field label="Start date"><input type="date" value={f.startDate ?? ""} onChange={set("startDate")} style={notesInput} /></Field>
      <Field label="Stage">
        <select value={f.stage ?? "verbal_yes"} onChange={set("stage")} style={notesInput}>
          {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s] ?? s}</option>)}
        </select>
      </Field>
      <div style={{ gridColumn: "1 / -1" }}>
        <button type="button" disabled={busy || !f.orgName} onClick={() => onCreate(f)} style={primaryBtn}>{busy ? "Creating…" : "Create deal"}</button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
      <span style={{ color: "var(--color-text-secondary,#666)" }}>{label}</span>
      {children}
    </label>
  );
}

// ── styles ───────────────────────────────────────────────────────────────────
const toolbar: CSSProperties = { display: "flex", alignItems: "center", gap: 12, margin: "4px 0 16px", flexWrap: "wrap" };
const search: CSSProperties = { width: "100%", border: "1px solid var(--color-border,#d2d2d7)", borderRadius: 9999, padding: "8px 14px 8px 30px", font: "inherit", fontSize: 14, outline: "none", background: "var(--color-surface,#fff)" };
const tabs: CSSProperties = { display: "inline-flex", background: "var(--color-bg-tertiary,#e8e8ed)", borderRadius: 9999, padding: 3 };
const tabBtn = (active: boolean): CSSProperties => ({ border: "none", borderRadius: 9999, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", background: active ? "var(--color-surface,#fff)" : "transparent", color: active ? "var(--color-navy-900,#132272)" : "var(--color-text-secondary,#666)", boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none" });
const primaryBtn: CSSProperties = { border: "none", borderRadius: 9999, padding: "9px 18px", background: "var(--color-navy-900,#132272)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" };
const statStrip: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 };
const statCard: CSSProperties = { background: "var(--color-surface,#fff)", border: "1px solid var(--color-border,#e8e8ed)", borderRadius: 16, padding: "16px 18px" };
const statCardAccent: CSSProperties = { background: "linear-gradient(168deg, #1a278a, #132272)", border: "none" };
const boardScroll: CSSProperties = { display: "flex", gap: 14, overflowX: "auto", paddingBottom: 12, alignItems: "flex-start" };
const column = (over: boolean): CSSProperties => ({ flex: "0 0 280px", minWidth: 280, background: over ? "var(--color-sky-50,#e7f8fd)" : "var(--color-bg-secondary,#f5f5f7)", borderRadius: 16, padding: 12, transition: "background 0.15s", border: over ? "1px dashed var(--color-sky-400,#4dc4e8)" : "1px solid transparent" });
const columnHead: CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "0 2px" };
const countPill: CSSProperties = { marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "var(--color-text-tertiary,#98989d)", background: "var(--color-surface,#fff)", borderRadius: 999, padding: "1px 8px" };
const card: CSSProperties = { background: "var(--color-surface,#fff)", border: "1px solid var(--color-border,#e8e8ed)", borderRadius: 14, padding: 14, cursor: "pointer", boxShadow: "0 1px 2px rgba(15,28,94,0.05)" };
const drawerBtn: CSSProperties = { border: "1px solid var(--color-border,#d2d2d7)", borderRadius: 9999, padding: "8px 14px", background: "var(--color-surface,#fff)", color: "var(--color-navy-900,#132272)", fontWeight: 600, fontSize: 13, cursor: "pointer" };
const notesInput: CSSProperties = { border: "1px solid var(--color-border,#ccc)", borderRadius: 8, padding: "8px 10px", font: "inherit", fontSize: 13, width: "100%" };
const tagStyle: CSSProperties = { padding: "1px 7px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: "var(--color-sky-100, #c4eef9)", color: "var(--color-sky-800, #0d5e7e)", textTransform: "uppercase", letterSpacing: "0.04em" };
